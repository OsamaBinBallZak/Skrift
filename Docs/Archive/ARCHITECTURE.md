# Architecture Overview

## System Design

The app uses a client-server architecture with clear separation of concerns:

```
┌─────────────────┐     HTTP/REST      ┌──────────────────┐
│                 │ ◄─────────────────► │                  │
│  Electron UI    │                     │  FastAPI Backend │
│  (React + TS)   │                     │    (Python)      │
│                 │                     │                  │
└─────────────────┘                     └──────────────────┘
        │                                        │
        └── User Interaction                     └── Whisper Processing
```

## Technology Stack

**Frontend:**
- Electron (desktop wrapper)
- React + TypeScript (UI)
- Tailwind CSS (styling)
- Vite (build tool)

**Backend:**
- FastAPI (REST API)
- Whisper.cpp (transcription)
- Metal (GPU acceleration)
- Python 3.8+

## Key Components

### Backend (`/backend`)

**API Endpoints:**
- `POST /api/files/upload` - Upload audio files
- `GET /api/files/` - List all files
- `POST /api/process/transcribe/{file_id}` - Start transcription
- `POST /api/process/sanitise/{file_id}` - Sanitise text with name linking
- `GET /api/process/enhance/stream/{file_id}` - Stream enhancement
- `POST /api/process/export/{file_id}` - Export final markdown
- `POST /api/process/{file_id}/cancel` - Cancel/reset processing
- `GET /api/system/resources` - System monitoring

**Core Modules:**
- `services/transcription.py` - Whisper integration with Metal
- `services/sanitisation.py` - Name linking and disambiguation
- `services/enhancement.py` - MLX-based text enhancement
- `services/export.py` - Markdown compilation
- `modules/mlx_runner.py` - MLX model execution
- `utils/status_tracker.py` - Heartbeat-based status tracking

### Frontend (`/frontend`)

**Main Components:**
- `App.tsx` - Application root
- `UploadTab.tsx` - Drag-and-drop upload
- `TranscribeTab.tsx` - Transcription UI with status (audio preview removed to reduce duplication)
- `SanitiseTab.tsx` - Review editor + processed audio player with word-click seeking
- `GlobalFileSelector.tsx` - File management

## Data Flow

1. **Upload**: Files → Backend → Individual folders
2. **Process**: Queue → Whisper → Status updates (heartbeat)
3. **Monitor**: Frontend polls → Backend status → UI updates

## File Storage

```
~/Documents/Voice Transcription Pipeline Audio Output/
└── [file_id]_[filename]/
    ├── original.m4a        # Original upload
    └── status.json         # Status + transcript
```

## Audio Playback and Streaming

- Processed audio is normalized to a stable filename inside each file folder: `processed.wav`.
  - If a tool produces `*_processed.wav`, the backend renames it to `processed.wav` and saves the resolved path in `status.audioMetadata.processed_wav_path`.
- HTTP endpoints (FastAPI) for playback:
  - `GET /api/files/{file_id}/audio/processed` → streams `processed.wav` (audio/wav)
  - `GET /api/files/{file_id}/audio/original` → streams the original upload
- Media responses set headers required for reliable in-app playback from Electron/web:
  - `Accept-Ranges: bytes` and full 206 Partial Content support when `Range` is requested
  - `Content-Disposition: inline; filename="..."`
  - `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`
- Frontend CSP (index.html) must allow media from the backend:
  - `media-src 'self' blob: http://localhost:8000 data: https:`
- UI behavior:
  - Sanitise tab shows a single player bound to the processed WAV. The transcript highlighting and word-click seeking are synced to this player.
  - The Transcribe tab no longer renders an audio element; playback is centralized in the Sanitise step.

## Word-level Timing and Highlighting

- Source of truth: Whisper JSON-full with token offsets (ms), optionally refined with DTW (--dtw), and --split-on-word for nice segment boundaries.
- Post-processing produces word_timings.json next to processed.wav with compact per-word start/end seconds (joined from subtokens). The editor consumes this file for highlighting.
- SRT is kept only for human export/viewing (CLI -osrt). We no longer synthesize token-level SRT from JSON.
- Sanitise highlighter pipeline:
  - Normalization: lowercase, strip punctuation, trim, remove [[ ]] wrappers.
  - Greedy windowed mapping: for each display word, scan ahead within a small window of word timings to find a match; do not advance the source pointer on misses.
  - Joined-token matching: if no single-token match, try joining 2..4 contiguous timing words (e.g., Th+ier+ry → Thierry, I+’m → I’m, T-+Rox → T-Rox) and map to the merged span.
  - Untimed words (edits/inserts) render but are skipped by highlight/seek until aligned.
- Runtime sync is driven by requestAnimationFrame on audio.currentTime with a small hysteresis to prevent flicker.

## Status Tracking

Uses heartbeat pattern instead of progress percentages:

```json
{
  "status": "transcribing",
  "lastActivityAt": "2025-09-02T20:15:30Z",
  "steps": {
    "transcribe": "processing"
  },
  "transcript": "..."
}
```

## Text Sanitisation

Update 2025-10 (disambiguation)
- When an alias maps to multiple people, the backend returns a 409 with each occurrence and candidate people; the UI prompts you to choose.
- First assigned occurrence per person becomes [[Canonical]]; later mentions use the configured short nickname.
- Whole‑word matching, avoid-inside-links, and possessive preservation are configurable in Settings → Sanitise.

The sanitisation step links people names and leaves other cleanup to the Enhance step.

Behavior (name linking only):
- Per person in names.json, the first mention becomes a canonical link: [[Canonical Name]].
- Subsequent mentions for that person become the unbracketed short nickname.
  - If a "short" nickname is not provided, it defaults to the first token of the canonical (e.g., [[Jack Timmons]] → "Jack").
- Case-insensitive, whole‑word matching. Avoids replacing inside existing [[...]] links.
- Possessives preserved (e.g., [[Alex]]’s).

Disambiguation when aliases are shared (e.g., multiple people called "Jack"):
- Clicking Sanitise will show a small disambiguation window whenever an alias maps to more than one person.
- For each ambiguous occurrence you can:
  - Apply → assign just this occurrence
  - Apply to remaining → assign this occurrence and automatically apply the same person to the remaining occurrences of that alias for this file
- For each person independently, the earliest assigned occurrence becomes [[Canonical]]; later occurrences for that person become the short nickname.
- Cancel closes the window and resets the sanitise step (you can re-run it later).

Configuration:
- Stored in a single file at backend/config/names.json with schema:
  {
    "people": [
      { "canonical": "[[Full Name]]", "aliases": ["Alias1", "Alias2"], "short": "Nickname" }
    ]
  }
- Edited via Settings → Names. The UI shows Canonical | Aliases | Nickname (short) in one row; aliases are comma‑separated. Entries are sorted alphabetically by canonical.

Output:
- Updated in the file’s status (sanitised text) and steps.sanitise set to done.

Notes:
- Filler word removal and spacing/punctuation cleanup are intentionally not performed in Sanitise; they are handled by Enhance.
- Replacement is computed in a single pass to avoid index drift and overlapping partial replacements.

Cancel/reset and state semantics
- The Cancel button in the disambiguation window triggers a backend cancel/reset for this step.
- Effect: clears transient disambiguation state, resets steps.sanitise for the file, and refreshes the UI so it does not remain stuck in "processing".
- When an alias conflict occurs (HTTP 409), the backend no longer marks sanitise as processing until a resolution is submitted; canceling returns the file to an idle state.

## AI Enhancement (Local)

Update 2025-10 (UI and flow)
- Enhance is a vertical, gated pipeline with four rows: Copy Edit → Summary → Keywords/Tags → Compile for Obsidian.
- Each row has Run and Apply. The next row is disabled until the current row is applied (or working text is restored from Sanitise).
- Colors, labels, and the Summary instruction come from Settings → Enhancement Options.
- Restore sanitised sets the working text back to the Sanitise output at any time.

Update 2025-09-08
- MLX-only, in-process via mlx-lm; requires selected model path and an Instruction (prompt).
- Model Manager: uploads/list/select/delete inside `backend/resources/models/mlx/` (external arbitrary paths disabled).
- External venv at `/Users/tiurihartog/Hackerman/mlx-env` keeps the repo clean.

Enhancement turns the sanitised text into a cleaned-up note suitable for export. It runs fully offline and updates only the file’s status; Export writes final files.

### Streaming
- Endpoint: `GET /api/process/enhance/stream/{file_id}?prompt=...` (text/event-stream)
- Events:
  - `start` → connection ready
  - `plan` → `{ used_chat_template, effective_max_tokens, prompt_preview }`
  - `token` → incremental chunks; emits `.` heartbeats when idle
  - `done` → final full text; persisted to status and step set to done
  - `error` → error text; step set to error

Compatibility note:
- Some mlx-lm builds do not support true token streaming (no `stream=True`). In that case, the backend falls back to a single non-stream generation and simulates progressive tokens over SSE while the job runs, then emits the full result on `done`.

### Prompt Composition
- Plain mode: `[Instruction]\n\nTranscript:\n...\n\nOutput:`
- Chat template mode: if `enhancement.mlx.use_chat_template=true` and `tokenizer.chat_template` exists, we render
  - messages = [{ role: system, content: Instruction }, { role: user, content: `Transcript: ...` }]
  - prompt = `tokenizer.apply_chat_template(messages, tokenize=false, add_generation_prompt=true)`

### Token Budget
- Effective max tokens per run:
  - `effective = min(max_tokens, max(min_tokens, input_tokens * ratio))`
  - Controlled by `enhancement.mlx.{max_tokens,dynamic_tokens,dynamic_ratio,min_tokens}`

### Timeout
- Enhancement has a safety timeout to prevent runaway jobs. Default is generous (1800 seconds) to accommodate long texts on local models. Configure via `enhancement.mlx.timeout_seconds`.

### API (high level)

Additional endpoints (pipeline fields and compile)
- POST /api/process/enhance/working/{file_id} { text }
- POST /api/process/enhance/summary/{file_id} { summary }
- POST /api/process/enhance/tags/{file_id} { tags: [] }
- POST /api/process/enhance/tags/generate/{file_id}
- POST /api/process/enhance/compile/{file_id}
- POST /api/process/enhance/{file_id} → non-streaming enhancement
- GET  /api/process/enhance/stream/{file_id} → streaming enhancement (falls back to simulated stream if mlx build lacks streaming)
- POST /api/process/enhance/test → model + prompt debug and smoke test
- GET/POST/DELETE under `/api/process/enhance/models` → model management

### Data and Status
- status.json.enhanced: string (current enhanced output)
- steps.enhance: pending | processing | done | error | skipped
- processingTime.enhance recorded

Export uses status.json.enhanced to produce enhanced.md; Enhance itself does not write .md/.txt files.

### Compile for Obsidian (code-only)
- Uses applied working text, summary, and tags to write compiled.md in the file’s output folder.
- YAML frontmatter fields include: title, date, lastTouched, firstMentioned, author: Tiuri, source: Voice-memo, location, tags (dash list), confidence, summary.
- Date preference: audio creation_time via ffprobe; fallback to file birth time (or mtime if not available).

## Key Design Decisions

1. **Heartbeat over Progress**: More reliable for long-running processes
2. **JSON Status Files**: Atomic updates, single source of truth
3. **Metal Acceleration**: 2-3x faster on Apple Silicon
4. **File-based Queue**: Simple, reliable, no external dependencies
5. **Stateless API**: Each request is independent

## Obsidian tag whitelist (read‑only)
- Vault path is selected in Settings → Enhancement (Choose Folder…). The app reads .md files but never writes to the vault.
- Whitelist is built only from YAML frontmatter at the very top of notes. Supports `tags: [a, b]` and the dash-list under `tags:`.
- Normalized (lowercase; strips leading `-`/`#`; numeric-only dropped) and stored at `backend/modules/Enhancement/tags_whitelist.json`.
- The Tags step generates up to N tags (default 10) constrained to the whitelist and applies them on approval.

## Startup behavior (renderer rebuild)
- ./start-background.sh rebuilds the renderer only when sources are newer than frontend/dist/index.html, ensuring the newest UI with fast launches.

## Performance

- Transcription: ~2-3x realtime
- Typical 1-min audio: 20-30 seconds
- Memory usage: ~3GB during processing
- Concurrent limit: 1 file at a time

## Known Limitations and Future Improvements

Current limitations (highlighting and seeking):
- Tokenization edge cases: subword splits (e.g., "Thi"+"erry"), apostrophe splits ("I"+"'"+"m"), hyphenation, diacritics, and leading spaces can make exact token matches harder. We mitigate with normalization and joined-token matching but there are still rare misses.
- Punctuation-heavy cues: cues that are only punctuation or mostly punctuation are currently ignored for alignment, which can slightly compress local timing.
- Aggressive edits: large insertions/deletions in the sanitised text produce untimed words. These render but are skipped by highlight/seek until a nearby match is found.
- Short-duration jitter: very short token spans can cause highlight flicker if playback scrubs back and forth quickly.
- Link wrappers: tokens wrapped in [[...]] are normalized, but multi-word names and possessives may still misalign in edge cases.
- Performance: the windowed greedy pass is O(n × window). It is fast enough for typical files but can still be optimized for very long transcripts.

Potential improvements:
- Fuzzy matching in-window: allow small Levenshtein distance on token comparisons, with canonicalization for apostrophes/dashes/diacritics to increase robust matches.
- Local re-alignment: when a burst of misses is detected, fall back to a small dynamic-programming alignment within a local sentence-sized window to resynchronize.
- Acoustic anchoring: snap candidate times to nearby high-energy boundaries (RMS/zero-cross heuristics) to improve click-to-seek precision around plosives and pauses.
- Confidence/metadata: if the timing JSON provides confidences, prefer higher-confidence tokens when multiple matches compete.
- Smarter normalization: apply Unicode NFC, consistent apostrophe and dash canonicalization, and selective punctuation retention (e.g., keep intra-word apostrophes).
- Compound/hyphen handling: heuristics to treat hyphens as either joiners or word boundaries based on surrounding context.
- UI/UX:
  - Visually distinguish untimed words and provide a quick "Set time from caret" action to anchor them.
  - Smooth highlight progression (e.g., sentence-level shading) and richer tooltips showing joined source tokens and exact times.
- Caching: persist word↔time mappings keyed by text hash and SRT mtime to avoid recomputing alignment for unchanged spans.
- Diagnostics: optional debug overlay that renders source SRT tokens, target tokens, the search window, and the match chosen.
- Backend options: expose a structured timeline JSON endpoint tailored for the highlighter (stable schema) and optionally a pre-joined-per-word SRT as an opt-in mode (currently disabled).
