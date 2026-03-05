# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Skrift** is a macOS desktop app for transcribing iPhone voice recordings (.m4a) to text using Metal-accelerated Whisper, then sanitising (name linking), enhancing (local MLX model), and exporting to Obsidian-compatible Markdown — all offline.

Architecture: Electron + React frontend communicates with a FastAPI Python backend over HTTP on `localhost:8000`.

---

## Commands

### Run (development)

```bash
# Start both backend and frontend in background (recommended)
./start-background.sh

# Check status
./status.sh

# Stop everything
./stop-all.sh
```

### Frontend only (from `frontend/`)

```bash
npm run dev          # Start Vite dev server + Electron (concurrent)
npm run build        # Build renderer + package with electron-builder
npm run lint         # ESLint with auto-fix
npm run type-check   # TypeScript check (no emit)
```

### Backend only (from `backend/`)

```bash
./start_backend.sh start     # Start (uses external MLX venv)
./start_backend.sh stop
./start_backend.sh restart
./start_backend.sh status

# Or run directly (requires mlx-env active)
python main.py
```

Backend runs on `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### Backend tests

```bash
cd backend
python test_batch_transcription.py
```

---

## Architecture

### Backend (`backend/`)

FastAPI app with routers split by domain:

| Router | Prefix | Purpose |
|--------|--------|---------|
| `api/files.py` | `/api/files` | Upload, list, delete audio files |
| `api/transcribe.py` | `/api/process/transcribe` | Trigger Whisper transcription |
| `api/sanitise.py` | `/api/process/sanitise` | Name linking (returns 409 on ambiguous aliases) |
| `api/enhance.py` | `/api/process/enhance` | MLX text enhancement, model management, tags |
| `api/export.py` | `/api/process/export` | Compile + export to Markdown/Obsidian |
| `api/batch.py` | `/api/batch` | Batch enhancement jobs |
| `api/system.py` | `/api/system` | Resource monitoring |
| `api/config.py` | `/api/config` | Read/write user settings |

Business logic lives in `services/`:
- `transcription.py` — Whisper.cpp via Metal/CoreML
- `sanitisation.py` — Name linking and disambiguation logic
- `enhancement.py` — MLX model invocation (streaming + fallback)
- `export.py` — Markdown/Obsidian compilation
- `batch_manager.py` — Batch job queue
- `mlx_runner.py` + `mlx_cache.py` — MLX model loading and inference

`utils/status_tracker.py` — heartbeat-style status files stored as `status.json` per file in the output folder.

`config/settings.py` — `Settings` class with dot-notation access (`settings.get('transcription.solo_model')`). User overrides persisted to `config/user_settings.json`. Dependency paths (whisper, mlx-env, mlx models) resolve relative to `Skrift_dependencies/` (sibling of the repo root).

**File storage layout:**
```
~/Documents/Voice Transcription Pipeline Audio Output/
└── [file_id]_[filename]/
    ├── original.m4a
    ├── processed.wav
    ├── status.json      ← single source of truth for all state
    └── word_timings.json
```

### Frontend (`frontend/`)

Entry: `src/main.tsx` → `App.tsx`

`App.tsx` is a tabbed shell (Upload / Transcribe / Sanitise / Enhance / Export / Settings). Tab feature components are imported from `./features/*` (currently being extracted). Shared primitives live in `shared/ui/` (shadcn/ui components).

Key files:
- `src/api.ts` — `ApiService` singleton, all HTTP calls to backend at `http://localhost:8000`
- `src/http.ts` — `fetchWithTimeout` / `fetchJsonWithRetry` helpers
- `src/types/pipeline.ts` — `PipelineFile` interface (canonical data model shared across tabs)
- `src/theme/ThemeProvider.tsx` — light/dark/system theme via CSS class on `<html>`, persisted to `localStorage`; syncs with Electron's `nativeTheme`
- `src/styles/tokens.css` — CSS custom properties for the design system (space-separated RGB values for Tailwind alpha support)
- `src/types/electron.d.ts` — `ElectronAPI` interface, `window.electronAPI` type declarations
- `src/hooks/useElectronAPI.ts` — hooks for Electron IPC (system info, file dialogs, pipeline events, theme)
- `shared/ui/` — shadcn/ui component library

### Design system

Colors use space-separated RGB values in CSS variables (e.g. `--color-primary: 37 99 235`) so Tailwind's alpha modifier works (`bg-primary/10`). Never use comma-separated values. Dark mode tokens are defined under `:root.dark`.

### Theme system

`ThemeProvider` adds `light` or `dark` class to `<html>`. The theme is stored in `localStorage` under `ui.theme`. Components must use the token-based CSS variables or Tailwind classes that map to them — avoid hardcoded colors.

### Sanitise flow (important detail)

Sanitise can return HTTP **409** when an alias maps to multiple people. The frontend must handle this specifically (not treat it as an error) and show a disambiguation modal. The `apiService.startSanitise()` method in `src/api.ts` already handles this.

### Enhancement pipeline

Enhance tab is a gated vertical pipeline: Copy Edit → Summary → Tags → Compile. Each step must be applied before the next unlocks. Enhancement uses a local MLX model via `mlx-lm` in an external venv (`Skrift_dependencies/mlx-env`). Streaming uses SSE; falls back to simulated streaming if the mlx-lm build doesn't support `stream=True`.

### People / names config

`backend/config/names.json` — schema:
```json
{ "people": [{ "canonical": "[[Full Name]]", "aliases": ["Nick"], "short": "Nick" }] }
```
Edited via Settings → Names in the UI.

---

## External dependencies

All heavy dependencies live **outside the repo** at `~/Hackerman/Skrift_dependencies/`:
- `mlx-env/` — Python venv with FastAPI, mlx-lm
- `whisper/Transcription/` — Whisper.cpp Metal modules
- `models/mlx/` — MLX model files

The path is configurable via `settings.get('dependencies_folder')`.
