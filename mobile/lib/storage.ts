import { File, Directory, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { MemoMetadata } from './metadata';
import type { CapturedPhoto } from '../hooks/useRecording';

export type ShareContentType = 'url' | 'image' | 'text' | 'file';

export type SharedContent = {
  type: ShareContentType;
  url?: string;
  urlTitle?: string;
  urlDescription?: string;
  urlThumbnailUrl?: string;
  text?: string;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
};

export type Memo = {
  id: string;
  filename: string;
  duration: number;
  recordedAt: string;
  tags: string[];
  syncStatus: 'waiting' | 'synced';
  audioUri: string;
  metadata: MemoMetadata | null;
  sharedContent?: SharedContent | null;
  annotationText?: string | null;
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

/**
 * Copy a photo to the recordings directory and return the new filename.
 * Returns null if the source doesn't exist.
 */
export function copyPhotoToRecordings(sourceUri: string, memoId: string): string | null {
  ensureRecordingsDir();
  try {
    const ext = sourceUri.split('.').pop() || 'jpg';
    const photoFilename = `photo_${memoId}.${ext}`;
    const dest = new File(recordingsDir, photoFilename);
    const source = new File(sourceUri);
    if (source.exists) {
      source.move(dest);
      return photoFilename;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Copy multiple timestamped photos to the recordings directory.
 * Returns image manifest entries with local filenames.
 */
function copyPhotosToRecordings(
  photos: CapturedPhoto[],
  memoId: string,
): { filename: string; offsetSeconds: number }[] {
  ensureRecordingsDir();
  const manifest: { filename: string; offsetSeconds: number }[] = [];

  photos.forEach((photo, i) => {
    try {
      const ext = photo.uri.split('.').pop() || 'jpg';
      const filename = `photo_${memoId}_${String(i + 1).padStart(3, '0')}.${ext}`;
      const dest = new File(recordingsDir, filename);
      const source = new File(photo.uri);
      if (source.exists) {
        source.move(dest);
        manifest.push({ filename, offsetSeconds: photo.offsetSeconds });
      }
    } catch {
      // skip failed copies
    }
  });

  return manifest;
}

export async function saveMemo(
  tempUri: string,
  duration: number,
  tags: string[],
  metadata?: MemoMetadata | null,
  photoUri?: string | null,
  photos?: CapturedPhoto[],
): Promise<Memo> {
  ensureRecordingsDir();

  const id = randomUUID();
  const filename = `memo_${id}.m4a`;
  const destFile = new File(recordingsDir, filename);

  const sourceFile = new File(tempUri);
  sourceFile.move(destFile);

  let finalMetadata = metadata ?? null;

  // Handle timestamped photos from recording (multi-photo manifest)
  if (photos && photos.length > 0 && finalMetadata) {
    const imageManifest = copyPhotosToRecordings(photos, id);
    finalMetadata = { ...finalMetadata, imageManifest };
  }
  // Handle single cover photo from review screen (legacy flow)
  else if (photoUri && finalMetadata) {
    const photoFilename = copyPhotoToRecordings(photoUri, id);
    finalMetadata = { ...finalMetadata, photoFilename };
  }

  const memo: Memo = {
    id,
    filename,
    duration,
    recordedAt: new Date().toISOString(),
    tags,
    syncStatus: 'waiting',
    audioUri: destFile.uri,
    metadata: finalMetadata,
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

/**
 * Save a captured item (URL, image, text) with optional voice/text annotation.
 */
export async function saveCaptureItem(opts: {
  audioUri?: string;
  duration?: number;
  sharedContent: SharedContent;
  annotationText?: string;
  metadata?: MemoMetadata | null;
}): Promise<Memo> {
  ensureRecordingsDir();

  const id = randomUUID();
  let filename = '';
  let audioUri = '';

  // Copy audio annotation if provided
  if (opts.audioUri) {
    filename = `capture_${id}.m4a`;
    const destFile = new File(recordingsDir, filename);
    const sourceFile = new File(opts.audioUri);
    sourceFile.move(destFile);
    audioUri = destFile.uri;
  }

  // Copy shared image file if it's a local file
  let sharedContent = { ...opts.sharedContent };
  if (sharedContent.filePath && (sharedContent.type === 'image' || sharedContent.type === 'file')) {
    try {
      const ext = sharedContent.filePath.split('.').pop() || 'jpg';
      const sharedFilename = `shared_${id}.${ext}`;
      const dest = new File(recordingsDir, sharedFilename);
      const source = new File(sharedContent.filePath);
      if (source.exists) {
        source.move(dest);
        sharedContent = { ...sharedContent, filePath: dest.uri, fileName: sharedFilename };
      }
    } catch {
      // keep original path if copy fails
    }
  }

  const memo: Memo = {
    id,
    filename,
    duration: opts.duration || 0,
    recordedAt: new Date().toISOString(),
    tags: [],
    syncStatus: 'waiting',
    audioUri,
    metadata: opts.metadata ?? null,
    sharedContent,
    annotationText: opts.annotationText || null,
  };

  const memos = await loadMemos();
  memos.unshift(memo);
  writeMemos(memos);

  return memo;
}

export async function deleteMemo(id: string): Promise<void> {
  const memos = await loadMemos();
  const memo = memos.find((m) => m.id === id);

  if (memo) {
    // Delete audio file
    try {
      const file = new File(memo.audioUri);
      if (file.exists) file.delete();
    } catch {
      // file might already be gone
    }

    // Delete cover photo if present
    if (memo.metadata?.photoFilename) {
      try {
        const photoFile = new File(recordingsDir, memo.metadata.photoFilename);
        if (photoFile.exists) photoFile.delete();
      } catch {
        // photo might already be gone
      }
    }

    // Delete timestamped photos from imageManifest
    if (memo.metadata?.imageManifest) {
      for (const entry of memo.metadata.imageManifest) {
        try {
          const imgFile = new File(recordingsDir, entry.filename);
          if (imgFile.exists) imgFile.delete();
        } catch {
          // image might already be gone
        }
      }
    }
  }

  const updated = memos.filter((m) => m.id !== id);
  writeMemos(updated);
}
