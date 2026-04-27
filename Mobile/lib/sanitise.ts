/**
 * On-device name sanitisation. Direct TS port of
 * backend/services/sanitisation.py.
 *
 * Behaviour matches the desktop default config: linking mode 'first' (only
 * the first occurrence gets the `[[Canonical]]` link, subsequent mentions
 * become the unbracketed short name); whole-word matching; preserve `'s`
 * possessives; skip matches that already sit inside `[[...]]` (so the
 * `[[img_NNN]]` photo markers won't be touched).
 *
 * Returns either `{ status: 'done', result }` or `{ status: 'ambiguous',
 * occurrences }` for the disambiguation modal.
 */

import { liveNames, type Person } from './names';

export type AmbiguityCandidate = { canonical: string; short: string };

export type Ambiguity = {
  alias: string;
  offset: number;
  length: number;
  contextBefore: string;
  contextAfter: string;
  candidates: AmbiguityCandidate[];
};

export type SanitiseResult =
  | { status: 'done'; result: string }
  | { status: 'ambiguous'; occurrences: Ambiguity[] };

const DEFAULT_OPTIONS = {
  wholeWord: true,
  avoidInsideLinks: true,
  preservePossessive: true,
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Is the position outside any existing `[[...]]` link? */
function notInsideLink(text: string, start: number): boolean {
  const open = text.lastIndexOf('[[', start);
  if (open === -1) return true;
  const close = text.indexOf(']]', open);
  return close !== -1 && close < start;
}

function canonicalCore(canonical: string): string {
  if (canonical.startsWith('[[') && canonical.endsWith(']]')) {
    return canonical.slice(2, -2);
  }
  return canonical;
}

function shortFor(person: Person): string {
  if (person.short && person.short.trim()) return person.short.trim();
  const core = canonicalCore(person.canonical);
  return core.split(/\s+/)[0] || '';
}

function buildAliasPattern(alias: string, opts: typeof DEFAULT_OPTIONS): RegExp {
  const wb = opts.wholeWord ? '\\b' : '';
  const possGroup = opts.preservePossessive ? "(?:'s|’s)?" : '';
  // Capture the possessive in a group so we can preserve it in the replacement.
  return new RegExp(`${wb}${escapeRegex(alias)}${wb}(${possGroup})`, 'gi');
}

/**
 * Run sanitisation. Reads people from the local names store. Returns either
 * the sanitised text or a list of ambiguities for the user to resolve.
 *
 * `decisions` (optional): map of `${alias}@${offset}` → canonical. Used by
 * the second pass after the disambiguation modal — pre-resolves matches at
 * specific offsets so they don't trigger ambiguity again.
 */
export async function sanitise(
  text: string,
  decisions?: Record<string, string>,
  options: Partial<typeof DEFAULT_OPTIONS> = {},
): Promise<SanitiseResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const people = await liveNames();

  // Build alias → people[] map for ambiguity detection.
  const aliasMap = new Map<string, Person[]>();
  for (const p of people) {
    for (const a of p.aliases) {
      const al = a.trim().toLowerCase();
      if (!al) continue;
      const arr = aliasMap.get(al) ?? [];
      arr.push(p);
      aliasMap.set(al, arr);
    }
  }

  // Detect ambiguous aliases present in text.
  const ambiguous: Ambiguity[] = [];
  for (const [alias, candidates] of aliasMap.entries()) {
    if (candidates.length < 2) continue;
    const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (opts.avoidInsideLinks && !notInsideLink(text, start)) continue;
      // If user already decided this exact occurrence, skip.
      const key = `${alias}@${start}`;
      if (decisions && decisions[key]) continue;
      ambiguous.push({
        alias,
        offset: start,
        length: end - start,
        contextBefore: text.slice(Math.max(0, start - 40), start),
        contextAfter: text.slice(end, Math.min(text.length, end + 40)),
        candidates: candidates.map((c) => ({
          canonical: c.canonical,
          short: shortFor(c),
        })),
      });
    }
  }
  if (ambiguous.length > 0 && !decisions) {
    return { status: 'ambiguous', occurrences: ambiguous };
  }

  // Sort people by canonical (case-insensitive, ignoring brackets).
  const sortedPeople = [...people].sort((a, b) =>
    canonicalCore(a.canonical).toLowerCase().localeCompare(canonicalCore(b.canonical).toLowerCase()),
  );

  let working = text;

  // First pass: apply decisions verbatim — replace the exact occurrence at
  // the recorded offset with the chosen canonical's link.
  if (decisions) {
    const decisionEntries = Object.entries(decisions)
      // Highest offset first so earlier replacements don't shift later ones.
      .map(([key, canonical]) => {
        const at = key.lastIndexOf('@');
        return { alias: key.slice(0, at), offset: parseInt(key.slice(at + 1), 10), canonical };
      })
      .sort((a, b) => b.offset - a.offset);

    for (const dec of decisionEntries) {
      const aliasLen = dec.alias.length;
      // Read the actual text at that offset (case-preserving) and replace.
      const slice = working.slice(dec.offset, dec.offset + aliasLen);
      // Build the link form
      const core = canonicalCore(dec.canonical);
      const link = `[[${core}]]`;
      working = working.slice(0, dec.offset) + link + working.slice(dec.offset + aliasLen);
      // (decisions don't preserve possessives — keeps the second pass simple)
      void slice;
    }
  }

  // Second pass: standard "first occurrence → link, rest → short" logic per person.
  for (const person of sortedPeople) {
    if (!person.canonical || person.aliases.length === 0) continue;
    const link = `[[${canonicalCore(person.canonical)}]]`;
    const short = shortFor(person);

    const patterns = person.aliases
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => buildAliasPattern(a, opts));
    if (patterns.length === 0) continue;

    // Find earliest match across all aliases for this person.
    let earliest: { start: number; end: number; possessive: string; pattern: RegExp } | null = null;
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(working)) !== null) {
        if (opts.avoidInsideLinks && !notInsideLink(working, m.index)) continue;
        if (!earliest || m.index < earliest.start) {
          earliest = {
            start: m.index,
            end: m.index + m[0].length,
            possessive: m[1] || '',
            pattern: re,
          };
        }
        // Don't break — there may be earlier matches for other patterns.
      }
    }

    if (!earliest) continue;

    // Replace the earliest occurrence with the link (preserving possessive).
    const before = working.slice(0, earliest.start);
    const after = working.slice(earliest.end);
    working = `${before}${link}${earliest.possessive}${after}`;

    // For subsequent occurrences, replace with the short name. We collect all
    // matches across all alias patterns first (in the post-link `working`),
    // then apply replacements back-to-front so earlier offsets stay valid.
    if (!short) continue;
    type Hit = { start: number; end: number; possessive: string };
    const hits: Hit[] = [];
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(working)) !== null) {
        const idx = m.index;
        if (opts.avoidInsideLinks && !notInsideLink(working, idx)) continue;
        // Skip if this match overlaps the link we just inserted.
        const linkEnd = earliest.start + link.length + earliest.possessive.length;
        if (idx >= earliest.start && idx < linkEnd) continue;
        hits.push({ start: idx, end: idx + m[0].length, possessive: m[1] || '' });
      }
    }
    // Dedupe overlapping hits: keep the earliest-starting one. Sort by start asc.
    hits.sort((a, b) => a.start - b.start);
    const deduped: Hit[] = [];
    let lastEnd = -1;
    for (const h of hits) {
      if (h.start >= lastEnd) {
        deduped.push(h);
        lastEnd = h.end;
      }
    }
    // Apply back-to-front so offsets don't shift the unprocessed remainder.
    for (let i = deduped.length - 1; i >= 0; i--) {
      const h = deduped[i];
      working = working.slice(0, h.start) + short + h.possessive + working.slice(h.end);
    }
  }

  return { status: 'done', result: working };
}
