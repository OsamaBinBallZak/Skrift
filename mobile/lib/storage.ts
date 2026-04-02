import { File, Directory, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

export type Memo = {
  id: string;
  filename: string;
  duration: number;
  recordedAt: string;
  tags: string[];
  syncStatus: 'waiting' | 'synced';
  audioUri: string;
  metadata: null;
};

const memosFile = new File(Paths.document, 'memos.json');
const recordingsDir = new Directory(Paths.document, 'recordings');

function ensureRecordingsDir() {
  if (!recordingsDir.exists) {
    recordingsDir.create();
  }
}

export async function loadMemos(): Promise<Memo[]> {
  try {
    if (!memosFile.exists) return [];
    const data = await memosFile.text();
    return JSON.parse(data) as Memo[];
  } catch {
    return [];
  }
}

function writeMemos(memos: Memo[]) {
  memosFile.write(JSON.stringify(memos));
}

export async function saveMemo(
  tempUri: string,
  duration: number,
  tags: string[],
): Promise<Memo> {
  ensureRecordingsDir();

  const id = randomUUID();
  const filename = `memo_${id}.m4a`;
  const destFile = new File(recordingsDir, filename);

  const sourceFile = new File(tempUri);
  sourceFile.move(destFile);

  const memo: Memo = {
    id,
    filename,
    duration,
    recordedAt: new Date().toISOString(),
    tags,
    syncStatus: 'waiting',
    audioUri: destFile.uri,
    metadata: null,
  };

  const memos = await loadMemos();
  memos.unshift(memo);
  writeMemos(memos);

  return memo;
}

export async function getMemo(id: string): Promise<Memo | null> {
  const memos = await loadMemos();
  return memos.find((m) => m.id === id) ?? null;
}

export async function deleteMemo(id: string): Promise<void> {
  const memos = await loadMemos();
  const memo = memos.find((m) => m.id === id);

  if (memo) {
    try {
      const file = new File(memo.audioUri);
      if (file.exists) file.delete();
    } catch {
      // file might already be gone
    }
  }

  const updated = memos.filter((m) => m.id !== id);
  writeMemos(updated);
}
