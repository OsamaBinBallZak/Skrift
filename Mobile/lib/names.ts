/**
 * Local names.json store on the phone, with bidirectional sync to the Mac.
 *
 * Schema mirrors backend/utils/names_store.py:
 *   {
 *     lastModifiedAt: ISO,
 *     people: [{ canonical, aliases, short?, lastModifiedAt, deleted? }]
 *   }
 *
 * Sync flow on `syncNames(host, port)`:
 *   1. GET /api/names/meta. If `remote.lastModifiedAt === local.lastModifiedAt`
 *      and we already pulled at least once, skip.
 *   2. Else GET /api/names → merge with local by canonical (last-write-wins per
 *      entry using `lastModifiedAt`).
 *   3. Write merged result locally.
 *   4. PUT merged result to Mac so its copy converges too.
 *
 * Tombstones (`deleted: true`) participate in last-write-wins like any other
 * version. The "live" projection used by sanitise filters them out.
 */

import { File, Paths } from 'expo-file-system';

export type Person = {
  canonical: string;          // always [[Name]]
  aliases: string[];
  short?: string | null;
  lastModifiedAt: string;     // ISO
  deleted?: boolean;
};

export type NamesData = {
  lastModifiedAt: string;
  people: Person[];
};

const namesFile = new File(Paths.document, 'names.json');

let _cache: NamesData | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function normaliseCanonical(c: string): string {
  const s = (c || '').trim();
  if (s.startsWith('[[') && s.endsWith(']]')) return s;
  return s ? `[[${s}]]` : '';
}

function topLevelTimestamp(people: Person[]): string {
  if (people.length === 0) return nowIso();
  const ts = people.map((p) => p.lastModifiedAt).filter(Boolean);
  return ts.length ? ts.sort().slice(-1)[0]! : nowIso();
}

function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => {
    const ka = (a.canonical.startsWith('[[') ? a.canonical.slice(2, -2) : a.canonical).toLowerCase();
    const kb = (b.canonical.startsWith('[[') ? b.canonical.slice(2, -2) : b.canonical).toLowerCase();
    return ka.localeCompare(kb);
  });
}

export async function loadNames(): Promise<NamesData> {
  if (_cache) return _cache;
  try {
    if (!namesFile.exists) {
      _cache = { lastModifiedAt: nowIso(), people: [] };
      return _cache;
    }
    const raw = await namesFile.text();
    const parsed = JSON.parse(raw) as NamesData;
    _cache = {
      lastModifiedAt: parsed.lastModifiedAt || nowIso(),
      people: Array.isArray(parsed.people) ? parsed.people : [],
    };
    return _cache;
  } catch {
    _cache = { lastModifiedAt: nowIso(), people: [] };
    return _cache;
  }
}

function writeData(data: NamesData) {
  const out: NamesData = {
    lastModifiedAt: topLevelTimestamp(data.people),
    people: sortPeople(data.people),
  };
  namesFile.write(JSON.stringify(out, null, 2));
  _cache = out;
}

/** Live (non-deleted) people — what sanitise consumes. */
export async function liveNames(): Promise<Person[]> {
  const d = await loadNames();
  return d.people.filter((p) => !p.deleted);
}

/** Add or update a person. Bumps `lastModifiedAt` to now. */
export async function upsertPerson(input: { canonical: string; aliases: string[]; short?: string | null }): Promise<void> {
  const canonical = normaliseCanonical(input.canonical);
  if (!canonical) throw new Error('canonical required');
  const data = await loadNames();
  const next: Person = {
    canonical,
    aliases: input.aliases.map((a) => a.trim()).filter(Boolean),
    short: input.short?.trim() || null,
    lastModifiedAt: nowIso(),
  };
  const idx = data.people.findIndex((p) => p.canonical === canonical);
  const out = [...data.people];
  if (idx >= 0) {
    // Resurrect from tombstone if necessary by overwriting `deleted`.
    out[idx] = { ...out[idx], ...next, deleted: false };
  } else {
    out.push(next);
  }
  writeData({ ...data, people: out });
}

/** Soft-delete: write a tombstone for sync. The entry stays in the file
 *  with `deleted: true` until pruned (after 90 days, by the backend). */
export async function deletePerson(canonical: string): Promise<void> {
  const c = normaliseCanonical(canonical);
  const data = await loadNames();
  const idx = data.people.findIndex((p) => p.canonical === c);
  if (idx < 0) return;
  const out = [...data.people];
  out[idx] = { ...out[idx], deleted: true, lastModifiedAt: nowIso() };
  writeData({ ...data, people: out });
}

/** Direct overwrite (used by the sync merge). Caller has already merged. */
export function saveNames(data: NamesData): void {
  writeData(data);
}

/** Substring (case-insensitive) match against canonical or any alias. */
export function searchPeople(people: Person[], query: string): Person[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter((p) => {
    if (p.canonical.toLowerCase().includes(q)) return true;
    if (p.aliases.some((a) => a.toLowerCase().includes(q))) return true;
    if (p.short && p.short.toLowerCase().includes(q)) return true;
    return false;
  });
}

// ── Sync ─────────────────────────────────────────────────────────────

function isLocalNewer(localTs: string | undefined, remoteTs: string | undefined): boolean {
  if (!localTs) return false;
  if (!remoteTs) return true;
  return localTs > remoteTs;
}

/**
 * Bidirectional sync. Returns a summary of what happened, mostly for logging.
 *
 * Algorithm:
 *   - Pull remote meta. If meta matches local top-level (no change either side),
 *     return 'unchanged'.
 *   - GET full remote. Merge by canonical (last-write-wins per entry).
 *   - Save merged locally.
 *   - PUT merged to Mac.
 */
export async function syncNames(host: string, port: number): Promise<
  | { status: 'unchanged' }
  | { status: 'merged'; localCount: number; remoteCount: number; mergedCount: number }
  | { status: 'failed'; error: string }
> {
  const local = await loadNames();
  const base = `http://${host}:${port}/api/names`;

  try {
    const metaController = new AbortController();
    const metaTimer = setTimeout(() => metaController.abort(), 5000);
    const metaRes = await fetch(`${base}/meta`, { signal: metaController.signal });
    clearTimeout(metaTimer);
    if (!metaRes.ok) return { status: 'failed', error: `meta ${metaRes.status}` };
    const meta = (await metaRes.json()) as { lastModifiedAt?: string };

    if (meta.lastModifiedAt && meta.lastModifiedAt === local.lastModifiedAt) {
      return { status: 'unchanged' };
    }

    // Decide direction: if local has a strictly newer top-level timestamp
    // and remote isn't ahead, we can probably skip the GET. But the safe
    // thing is to always pull and merge — costs little.
    const fullController = new AbortController();
    const fullTimer = setTimeout(() => fullController.abort(), 10_000);
    const fullRes = await fetch(`${base}`, { signal: fullController.signal });
    clearTimeout(fullTimer);
    if (!fullRes.ok) return { status: 'failed', error: `get ${fullRes.status}` };
    const remote = (await fullRes.json()) as NamesData;

    const merged = mergeByCanonical(local.people, remote.people || []);
    const out: NamesData = {
      lastModifiedAt: topLevelTimestamp(merged),
      people: sortPeople(merged),
    };
    writeData(out);

    // Push merged result back to Mac so its copy converges.
    const putController = new AbortController();
    const putTimer = setTimeout(() => putController.abort(), 10_000);
    await fetch(`${base}`, {
      method: 'PUT',
      signal: putController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out),
    });
    clearTimeout(putTimer);

    return {
      status: 'merged',
      localCount: local.people.length,
      remoteCount: (remote.people || []).length,
      mergedCount: out.people.length,
    };
  } catch (err) {
    return { status: 'failed', error: String(err) };
  }
}

/** Per-canonical last-write-wins merge. Tombstones participate normally. */
export function mergeByCanonical(localPeople: Person[], remotePeople: Person[]): Person[] {
  const byCanonical = new Map<string, Person>();
  for (const p of localPeople) {
    if (!p.canonical) continue;
    byCanonical.set(p.canonical, p);
  }
  for (const r of remotePeople) {
    if (!r.canonical) continue;
    const existing = byCanonical.get(r.canonical);
    if (!existing) {
      byCanonical.set(r.canonical, r);
      continue;
    }
    // Compare by lastModifiedAt — newer wins. Ties default to remote (arbitrary).
    if (!existing.lastModifiedAt || (r.lastModifiedAt && r.lastModifiedAt >= existing.lastModifiedAt)) {
      byCanonical.set(r.canonical, r);
    }
  }
  return Array.from(byCanonical.values());
}
