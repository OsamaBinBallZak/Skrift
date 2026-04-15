# Skrift Mobile — CLAUDE.md

## What This Is

iPhone companion app for the Skrift desktop pipeline. Captures voice memos with contextual metadata (location, weather, pressure, daylight, steps) and syncs them to the Mac for processing. The phone is a capture device — all transcription and LLM work happens on the Mac.

Full spec: `Mobile/docs/skrift-mobile-spec.md` (at repo root)

## Tech Stack

- **Framework:** Expo SDK 54, React Native 0.81, TypeScript
- **Navigation:** expo-router (file-based, tab layout)
- **Audio:** expo-audio (hook-based API: `useAudioRecorder`, `useAudioPlayer`)
- **Storage:** expo-file-system (new `File`/`Directory`/`Paths` API, not legacy `FileSystem.*`)
- **IDs:** expo-crypto (`randomUUID()`)
- **Dev build:** expo-dev-client required (no Expo Go — native modules needed)

## Commands

```bash
cd mobile
npm install --legacy-peer-deps   # peer dep conflicts require this flag
npx tsc --noEmit                 # TypeScript check
npx expo start --dev-client      # Run (requires dev client on iPhone)
```

## Architecture

### Navigation (`app/`)

```
app/
├── _layout.tsx              # Root Stack (dark theme, no headers)
├── (tabs)/
│   ├── _layout.tsx          # Tab bar: Memos | Record (red circle) | Settings
│   ├── index.tsx            # Memos list (FlatList, pull-to-refresh, long-press delete)
│   ├── record.tsx           # Recording screen (live timer, metering, memory aid prompts)
│   └── settings.tsx         # Settings (placeholder sections)
├── review.tsx               # Post-recording review (playback, tags, save/discard)
└── memo/
    └── [id].tsx             # Memo detail (playback, tags, sync status, delete)
```

### Core modules

| Module | Path | Purpose |
|--------|------|---------|
| Storage | `lib/storage.ts` | Memo CRUD: JSON index + .m4a files in `Paths.document` |
| Recording | `hooks/useRecording.ts` | Wraps `useAudioRecorder`, exposes start/stop/duration/metering |
| Playback | `hooks/usePlayback.ts` | Wraps `useAudioPlayer`, exposes play/pause/seek/position |
| Colors | `constants/colors.ts` | Dark + light tokens matching desktop app |

### Data model

```typescript
type Memo = {
  id: string;              // randomUUID
  filename: string;        // memo_{id}.m4a
  duration: number;        // seconds
  recordedAt: string;      // ISO datetime
  tags: string[];
  syncStatus: 'waiting' | 'synced';
  audioUri: string;        // file:// path in recordings dir
  metadata: null;          // placeholder for Phase 2
}
```

Memos stored as `Paths.document/memos.json` (index) + `Paths.document/recordings/*.m4a` (audio).

### Sync target

The Mac's FastAPI backend at `http://<local-ip>:8000`. Upload via `POST /api/files/upload` with multipart form (audio + metadata JSON + optional photo). Health check at `GET /api/system/health`.

## Design system

Color tokens in `constants/colors.ts` match the desktop app exactly:
- Accent purple: `#7c6bf5` (dark) / `#6c5ce7` (light)
- Dark theme is default
- Background: `#0f1117`, Surface: `#181a23`
- Destructive red: `#ef4444` (used for record button)

## API notes

### expo-audio (SDK 54)
- Hook-based: `useAudioRecorder(preset)`, `useAudioPlayer(source)`, `useAudioRecorderState(recorder)`, `useAudioPlayerStatus(player)`
- No class-based `Audio.Recording` / `Audio.Sound` — that's the old expo-av API
- Metering is on `RecorderState.metering`, NOT on `RecordingStatus`
- `RecordingPresets.HIGH_QUALITY` records .m4a (AAC) by default

### expo-file-system (SDK 54)
- New API: `File`, `Directory`, `Paths` classes — NOT the legacy `FileSystem.documentDirectory` etc.
- `new File(Paths.document, 'name.json')` — create file reference
- `file.text()` (async), `file.write(string)` (sync), `file.exists` (property), `file.delete()`, `file.move(dest)`
- `directory.create()`, `directory.exists`

## Build phases

- [x] **Phase 1** — Recording + local storage (navigation, recording, playback, memo CRUD)
- [ ] **Phase 2** — Metadata capture (GPS, weather, pressure, daylight, steps, tags, photo)
- [ ] **Phase 3** — Sync to Mac (QR setup, health check, upload, retry queue, backend changes)
- [ ] **Phase 4** — Polish (theme toggle, Share Sheet, swipe gestures, extended YAML frontmatter)
- [ ] **Phase 5** — Future (HealthKit, Lock Screen widget, Action Button)

## Status

- Developer account pending — cannot run on device yet
- TypeScript compiles clean
- `npm install --legacy-peer-deps` required due to peer dep conflicts in Expo 54
