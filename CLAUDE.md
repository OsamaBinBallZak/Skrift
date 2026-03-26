# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Skrift** is a macOS desktop app for transcribing iPhone voice recordings (.m4a) and Apple Notes exports to text using MLX-accelerated Parakeet, then sanitising (name linking), enhancing (local MLX model), and exporting to Obsidian-compatible Markdown — all offline.

Architecture: Electron + React frontend (`frontend-new/`) communicates with a FastAPI Python backend over HTTP on `localhost:8000`.

---

## Commands

### Run (development)

```bash
# Double-click to open in Terminal (sources full shell env, starts backend + Electron dev mode)
open '/Users/tiurihartog/Hackerman/Skrift/Open Skrift New.command'

# Or manually:
cd frontend-new && npm run dev:electron   # Vite dev server + Electron concurrently

# Stop backend
cd backend && ./start_backend.sh stop
```

### Frontend only (from `frontend-new/`)

```bash
npm run dev            # Vite dev server only (no Electron)
npm run dev:electron   # Vite dev server + Electron (full dev mode)
npm run build          # TypeScript check + Vite production build → renderer-dist/
npm run build:electron # Full build + electron-builder → dist-electron/Skrift-*.dmg
npm run type-check     # TypeScript check (no emit)
npm run lint           # ESLint with auto-fix
```

### Backend only (from `backend/`)

```bash
./start_backend.sh start     # Start (resolves deps from user_settings.json or defaults)
./start_backend.sh stop
./start_backend.sh restart
./start_backend.sh status
```

Backend runs on `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### Building a distributable

```bash
cd frontend-new && npm run build:electron
# Output: dist-electron/Skrift-0.1.0-arm64.dmg
# App icon: /Users/tiurihartog/Hackerman/Skrift/Icons/Skrift_icon_light.icns
```

The packaged app spawns the backend via `bash -l backend/start_backend.sh start` (login shell so Homebrew PATH is available). Falls back to `~/Hackerman/Skrift/backend/start_backend.sh` if relative path not found.

**Important:** `start_backend.sh` resolves its own location via `BASH_SOURCE`, reads the dependencies path from `config/user_settings.json`, and exports `/opt/homebrew/bin` so `ffmpeg` is always available.

---

## Architecture

### Backend (`backend/`)

FastAPI app with routers split by domain:

| Router | Prefix | Purpose |
|--------|--------|---------|
| `api/files.py` | `/api/files` | Upload, list, delete audio/note files |
| `api/transcribe.py` | `/api/process/transcribe` | Trigger Parakeet transcription; supports `force` flag to re-transcribe |
| `api/sanitise.py` | `/api/process/sanitise` | Name linking (returns 409 on ambiguous aliases) |
| `api/enhance.py` | `/api/process/enhance` | MLX text enhancement, model management, tags |
| `api/export.py` | `/api/process/export` | Compile + export to Markdown/Obsidian |
| `api/batch.py` | `/api/batch` | Batch enhancement jobs with SSE streaming |
| `api/system.py` | `/api/system` | Resource monitoring, health check |
| `api/config.py` | `/api/config` | Read/write user settings |

Business logic lives in `services/`:
- `transcription.py` — Parakeet-MLX transcription (in-process, model cached as singleton between calls). Audio preprocessing via ffmpeg: high-pass filter + `afftdn` adaptive denoiser + EBU R128 loudness normalization. Produces `word_timings.json` by merging BPE sub-word tokens into whole words.
- `sanitisation.py` — Name linking and disambiguation logic
- `enhancement.py` — MLX model invocation (streaming SSE); auto-unloads after 10s idle in manual mode
- `export.py` — Markdown/Obsidian compilation; reads `export.attachments_folder` for image destination
- `batch_manager.py` — Batch enhancement queue: Title → Copy Edit → Summary → Tags → Compile, SSE broadcast of tokens, MLX model stays loaded throughout batch, unloads on completion
- `mlx_runner.py` + `mlx_cache.py` — MLX model singleton cache; survives between calls within a session
- `apple_notes_importer.py` — Apple Notes `.md` export parser; sets `source: Apple-Note` in frontmatter

**Batch transcription note:** Batch transcription in `batch_manager.py` is non-functional (legacy whisper-server code). **Do not use `/api/batch/transcribe/start`**. Instead, call `/api/process/transcribe/{id}` for each file individually (which is what the frontend does).

**Batch enhancement** (`/api/batch/enhance/start`) works correctly — calls enhancement service directly, keeps MLX model hot, broadcasts tokens via SSE at `GET /api/batch/enhance/stream`.

`utils/status_tracker.py` — heartbeat-style status files stored as `status.json` per file in the output folder.

`config/settings.py` — `Settings` class with dot-notation access (`settings.get('transcription.parakeet_model')`). User overrides persisted to `config/user_settings.json`.

**Key settings paths:**
- `export.note_folder` — Obsidian vault root
- `export.audio_folder` — vault subfolder for voice memos
- `export.attachments_folder` — vault subfolder for images/attachments (falls back to vault root if empty)
- `enhancement.tags` — `{ max_old, max_new, selection_criteria }`
- `transcription.noise_reduction` — afftdn noise floor in dB (-10 = aggressive, -30 = gentle, 0 = off)
- `transcription.highpass_freq` — High-pass filter cutoff in Hz (0 = off, 80 = default)

**File storage layout:**
```
~/Documents/Voice Transcription Pipeline Audio Output/
└── [file_id]_[filename]/
    ├── original.m4a          # or original.md for Apple Notes
    ├── processed.wav         # denoised + normalized audio fed to Parakeet
    ├── compiled.md
    ├── status.json           ← single source of truth for all state
    └── word_timings.json     # word-level timestamps for karaoke
```

**Health endpoint:** `GET /api/system/health` returns `transcription_modules.parakeet.available`.

### Frontend (`frontend-new/`)

Entry: `src/main.tsx` → `App.tsx`

`App.tsx` is the shell — manages selected file, seekTo state for karaoke, first-launch setup detection, and renders:
- `Sidebar` — file list, multi-select with batch actions, upload
- `NoteDisplay` — note body (contenteditable) + karaoke text overlay
- `Inspector` — right panel: transcription, cleanup, enhancement, export controls

**First-launch detection:** On mount, checks `GET /api/system/health`. If backend is unreachable or parakeet unavailable, opens Settings in setup mode (welcome banner, Paths tab, close button hidden until configured).

Key files:
- `src/api.ts` — `api` singleton + `API_BASE` export, all HTTP calls to `http://localhost:8000`
- `src/types/pipeline.ts` — `PipelineFile` interface, `SystemHealth` type
- `src/hooks/useSettings.ts` — `AppSettings` with localStorage + backend config sync; includes `vaultPath`, `vaultAudioPath`, `vaultAttachmentsPath`
- `src/components/SystemStatus.tsx` — 2 dots: Backend / Parakeet
- `src/components/KaraokeText.tsx` — word-level highlight; zero padding on all tokens (toggling padding breaks line wrapping); click-to-seek via `onSeek` prop
- `src/components/NoteBody.tsx` — contenteditable; floating toolbar on text selection for adding names; `AddNameModal`
- `src/components/DisambiguationModal.tsx` — shown on 409 from sanitise
- `src/features/Sidebar.tsx` — multi-select mode; batch Transcribe (calls `startTranscription` per file) and Enhance (calls `startEnhanceBatch`); progress bar + SSE token stream for enhance; stale `checked` IDs pruned on file list change
- `src/features/Inspector.tsx` — `localTagSuggestions` seeded from `file.tag_suggestions` on poll update (so batch-generated tags appear without clicking "Suggest Tags")
- `src/features/NoteDisplay.tsx` — NoteBody always mounted, hidden during karaoke (preserves edits)
- `src/features/settings/PathsTab.tsx` — "Local folders" and "Obsidian vault" sections
- `src/features/settings/TranscriptionTab.tsx` — Engine info, model name, audio preprocessing sliders (noise reduction, high-pass filter)
- `src/features/settings/EnhancementTab.tsx` — `TagSettings` component (max_old, max_new, selection_criteria textarea)

### Electron (`frontend-new/electron/`)

- `main.cjs` — main process; spawns backend via `bash -l`; uses `fs.existsSync` to fall back to absolute repo path; registers `file://` protocol for audio playback; `dialog:openUpload` IPC opens native picker accepting files and folders
- `preload.cjs` — contextBridge exposing `electronAPI` to renderer

### Design system

Colors use space-separated RGB values in CSS variables (e.g. `--color-primary: 37 99 235`) so Tailwind's alpha modifier works (`bg-primary/10`). Never use comma-separated values. Dark mode tokens are defined under `:root.dark`.

### Sanitise flow

Sanitise can return HTTP **409** when an alias maps to multiple people. `api.startSanitise()` handles 409 as a valid response and calls `groupOccurrences()` to transform the flat backend `occurrences` array into grouped `Ambiguity[]` for the disambiguation modal.

### Transcription pipeline

Parakeet-MLX is the sole transcription engine. Audio preprocessing: ffmpeg high-pass → afftdn adaptive denoiser → EBU R128 loudness normalization → 16kHz mono WAV. The Parakeet model is cached as a singleton (loads once, stays in memory). Progress is reported via `chunk_callback` for long files. Force-retranscribe deletes `processed.wav` so preprocessing runs fresh with current denoiser settings.

Sub-word BPE tokens from Parakeet are merged into whole words using leading-space detection before writing `word_timings.json`.

### Enhancement pipeline

Single file: Title → Copy Edit → Summary → Tags (manual approval) → Compile. `steps.enhance` is set to `done` only after compile runs with all parts present (including approved tags). Streaming uses SSE.

Batch: same steps via `batch_manager`. Tags are generated as `tag_suggestions` (not auto-approved). `steps.enhance` stays pending until user approves tags per file. **Progress bar in sidebar tracks `enhanced_title && enhanced_summary` being set** (not `steps.enhance === done`) so it fills when LLM work is done.

### Apple Notes import

Dropping or selecting a folder via `+ Upload`:
- Electron's `dialog:openUpload` IPC returns both file paths and folder paths
- Folder paths sent as `note_folder_paths` JSON field in FormData
- Backend `apple_notes_importer.py` parses the `.md`, extracts title/date/content, sets `source: Apple-Note`
- Images referenced in the note are resolved to `export.attachments_folder` on export

Dragging a single `.md` file also works (treated as a note file).

### People / names config

`backend/config/names.json` — schema:
```json
{ "people": [{ "canonical": "[[Full Name]]", "aliases": ["Nick"], "short": "Nick" }] }
```
Edited via Settings → Names in the UI. **No duplicate aliases** — duplicates cause false ambiguity in sanitise (409 for a name that shouldn't be ambiguous).

---

## External dependencies

All heavy dependencies live **outside the repo** in a configurable dependencies folder (default `~/Hackerman/Skrift_dependencies/`):
- `mlx-env/` — Python venv with FastAPI, parakeet-mlx, mlx-lm
- `models/parakeet/` — Parakeet TDT v3 model weights (auto-downloads from HuggingFace on first transcription)
- `models/mlx/` — MLX language model files for text enhancement

The path is configurable via `settings.get('dependencies_folder')`. `start_backend.sh` reads it from `config/user_settings.json` at startup.

`ffmpeg` must be on PATH — installed via Homebrew at `/opt/homebrew/bin/ffmpeg`. `start_backend.sh` prepends `/opt/homebrew/bin` to PATH at startup to ensure this works in all launch contexts.

### Distribution

A distributable folder (`~/Desktop/Skrift-Distribution/`) contains:
- `Skrift-0.1.0-arm64.dmg` — the Electron app
- `Skrift_dependencies/models/mlx/` — MLX enhancement model weights
- `setup.sh` — one-time setup script: auto-installs Python 3.10+ and ffmpeg via Homebrew if needed, creates a fresh Python venv, installs all packages
- `README.txt` — setup instructions

The `mlx-env/` venv is NOT distributed (path-specific); `setup.sh` creates it fresh. The Parakeet model (~1.2 GB) auto-downloads from HuggingFace on first transcription.

Recipients run `./setup.sh`, drag the app to Applications, point Settings → Paths to the dependencies folder, and restart.
