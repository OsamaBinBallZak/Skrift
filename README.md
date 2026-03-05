# Skrift

macOS desktop app for transcribing iPhone voice recordings to polished, searchable text — fully offline.

Records your `.m4a` files through Metal-accelerated Whisper, links names to Obsidian wikilinks, enhances the transcript with a local MLX model, and exports Markdown ready for Obsidian.

**Stack:** Electron + React / FastAPI + Python · Apple Silicon only

---

## Launch

Double-click **`Open Skrift.command`** in the project folder. The app manages everything — starts the backend, shows a loading screen while it warms up, then opens the main UI.

---

## Prerequisites

- macOS with Apple Silicon (M1/M2/M3/M4)
- Node.js 18+
- Python 3.10+
- Dependencies folder populated at `~/Hackerman/Skrift_dependencies/` (see below)

---

## Dependencies

Large model files live outside the repo so it stays lightweight:

```
~/Hackerman/Skrift_dependencies/
├── mlx-env/               # Python venv with FastAPI + mlx-lm
├── whisper/Transcription/ # Whisper.cpp Metal modules
└── models/mlx/            # MLX model files (e.g. Qwen3-4B-Instruct)
```

---

## Workflow

1. **Upload** — drag `.m4a` files from iPhone
2. **Transcribe** — Whisper generates transcript with word-level timings (click any word to seek)
3. **Sanitise** — links names to `[[Obsidian wikilinks]]`, with a disambiguation modal for shared nicknames
4. **Enhance** — local MLX model polishes grammar, removes fillers, summarises, adds tags
5. **Export** — Markdown with YAML frontmatter, ready to drop into Obsidian

---

## Architecture

```
Skrift/
├── backend/           # FastAPI (Python)
│   ├── api/           # Routers: files, transcribe, sanitise, enhance, export, batch
│   ├── services/      # Business logic: Whisper, MLX, export, batch queue
│   └── config/        # settings.py, names.json, user_settings.json
├── frontend/          # Electron + React + TypeScript
│   ├── main.js        # Main process: window + backend lifecycle
│   ├── features/      # Tab components (Upload, Transcribe, Sanitise, Enhance, Export, Settings)
│   └── shared/        # Shared UI (shadcn/ui)
└── Skrift_dependencies/   # Not in repo — models + venvs (13GB)
```

Backend runs on `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

Transcripts are saved to:
```
~/Documents/Voice Transcription Pipeline Audio Output/
```

---

## Development

```bash
# Start everything (Vite + Electron, backend auto-starts)
cd frontend
npm run dev

# Backend only
cd backend
./start_backend.sh start

# Type check / lint
cd frontend
npm run type-check
npm run lint
```

Logs: `backend/backend.log`

---

## Build

```bash
# From terminal
cd frontend && npm run dist
# Or double-click Build Skrift.command
```

Output: `frontend/dist/Skrift-1.0.0.dmg`

---

## Troubleshooting

**Stuck on loading screen?**
```bash
./status.sh
tail -f backend/backend.log
```

**Force stop everything:**
Double-click `Stop Skrift.command`, or run `./stop-all.sh`

**Models not found?**
Check `~/Hackerman/Skrift_dependencies/` exists and the paths in Settings match.

---

Built with [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) and [MLX](https://github.com/ml-explore/mlx).
