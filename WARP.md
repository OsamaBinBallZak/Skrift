# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

THE APP V2.0 is an audio transcription pipeline that transcribes iPhone voice recordings (.m4a) to text using Metal-accelerated Whisper on Mac, with local AI enhancement via MLX. The app is a production-ready Electron desktop application with a FastAPI backend.

**Tech Stack:**
- Backend: FastAPI (Python 3.8+), Whisper.cpp with Metal acceleration, MLX for AI enhancement
- Frontend: Electron + React + TypeScript + Tailwind CSS + Vite
- Platform: macOS (Apple Silicon M1/M2/M3/M4 required for Metal/MLX)

## Common Commands

### Running the Application

```bash
# Start everything (backend + frontend) - use from project root
./start-background.sh

# Check if services are running
./status.sh

# Stop all services
./stop-all.sh
```

### Development Mode

```bash
# Backend development (Terminal 1)
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 main.py

# Frontend development (Terminal 2)
cd frontend
npm install
npm run dev
```

### Testing and Linting

```bash
# Frontend linting
cd frontend
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues

# Frontend type checking
npm run type-check
```

### Building for Production

```bash
# Build frontend renderer only (fast)
cd frontend
npm run build-renderer

# Build full Electron installer
npm run dist
```

### Viewing Logs

```bash
# Backend logs
tail -f backend/backend.log

# Frontend logs  
tail -f frontend/frontend.log
```

### API Testing

Backend runs on `http://localhost:8000`. Use curl with timeouts to avoid hanging:

```bash
# List files
curl --fail --show-error --silent --connect-timeout 2 --max-time 5 http://localhost:8000/api/files/

# API documentation
open http://localhost:8000/docs
```

### Port Management

```bash
# Kill process on port 8000 if stuck
lsof -ti:8000 | xargs kill -9
```

## Architecture

### System Design

Client-server architecture with clear separation:
- **Frontend**: Electron app (React + TypeScript) with tabbed UI for Upload → Transcribe → Sanitise → Enhance → Export workflow
- **Backend**: FastAPI REST API with 8 router modules handling file management, transcription, sanitisation, enhancement, and export

### Backend Structure (`/backend`)

```
backend/
├── main.py              # FastAPI application entry point
├── models.py            # Pydantic data models
├── api/                 # 8 REST API routers
│   ├── files.py         # File upload, listing, deletion, audio streaming
│   ├── processing.py    # General processing controls (cancel, reset)
│   ├── transcribe.py    # Transcription endpoints
│   ├── sanitise.py      # Name linking and text cleanup
│   ├── enhance.py       # MLX-based AI enhancement + model management
│   ├── export.py        # Markdown export generation
│   ├── system.py        # Resource monitoring
│   └── config.py        # Settings management
├── services/            # Business logic layer
│   ├── transcription.py # Whisper integration
│   ├── sanitisation.py  # Name linking with disambiguation
│   ├── enhancement.py   # MLX runner wrapper
│   ├── mlx_runner.py    # MLX model execution
│   └── export.py        # Markdown compilation
├── utils/               # Helper utilities
├── config/              # Configuration (settings.json, names.json)
└── resources/           # Models and external binaries
    ├── models/mlx/      # MLX models (local AI)
    └── whisper/         # Whisper.cpp binaries
```

**Key Backend Patterns:**
- **Heartbeat status tracking**: Files use `lastActivityAt` timestamps rather than progress percentages for reliability with long-running processes
- **JSON status files**: Each transcription has a `status.json` file as single source of truth
- **Atomic file operations**: Updates are atomic to prevent corruption
- **External MLX environment**: MLX dependencies live in `/Users/tiurihartog/Hackerman/mlx-env` to keep repo portable

### Frontend Structure (`/frontend`)

```
frontend/
├── main.js              # Electron main process entry
├── App.tsx              # Application root with tab routing
├── components/          # React UI components
│   ├── UploadTab.tsx
│   ├── TranscribeTab.tsx
│   ├── SanitiseTab.tsx
│   ├── EnhanceTab.tsx
│   ├── ExportTab.tsx
│   └── GlobalFileSelector.tsx
├── src/api.ts           # Backend API client
└── vite.config.ts       # Vite build configuration
```

### Data Flow

1. **Upload**: User drags .m4a files → stored in `~/Documents/Voice Transcription Pipeline Audio Output/[file_id]_[filename]/`
2. **Transcribe**: Whisper.cpp processes audio → generates transcript, word_timings.json, processed.wav
3. **Sanitise**: Name linking with disambiguation modal → replaces first mention with `[[Canonical Name]]`, subsequent with nickname
4. **Enhance**: Local MLX model polishes text → streams output via SSE
5. **Export**: Compiles enhanced text + metadata → generates Obsidian-ready markdown with YAML frontmatter

### File Storage Structure

```
~/Documents/Voice Transcription Pipeline Audio Output/
└── [file_id]_[filename]/
    ├── original.m4a           # Original upload
    ├── processed.wav          # Normalized audio for playback
    ├── status.json            # Status + all processing results
    ├── word_timings.json      # Word-level timestamps for highlighting
    ├── transcript.srt         # SRT subtitle file (export only)
    ├── enhanced.md            # Final enhanced output
    └── compiled.md            # Obsidian-ready with frontmatter
```

## Key API Endpoints

Base URL: `http://localhost:8000`

**Files:**
- `POST /api/files/upload` - Upload audio files
- `GET /api/files/` - List all files
- `GET /api/files/{file_id}` - Get file details
- `DELETE /api/files/{file_id}` - Delete file
- `GET /api/files/{file_id}/audio/processed` - Stream processed audio (supports HTTP 206 range requests)
- `GET /api/files/{file_id}/word_timings` - Get word-level timing data
- `PUT /api/files/{file_id}/transcript` - Update transcript manually

**Processing:**
- `POST /api/process/transcribe/{file_id}` - Start transcription (Metal-accelerated Whisper)
- `POST /api/process/sanitise/{file_id}` - Sanitise with name linking (returns 409 if disambiguation needed)
- `POST /api/process/sanitise/{file_id}/resolve` - Resolve disambiguation choices
- `POST /api/files/{file_id}/sanitise/cancel` - Cancel/reset sanitise step only
- `GET /api/process/enhance/stream/{file_id}?prompt=...` - Stream AI enhancement (SSE)
- `POST /api/process/enhance/{file_id}` - Non-streaming enhancement
- `POST /api/process/export/{file_id}` - Generate final markdown
- `POST /api/process/{file_id}/cancel` - Cancel processing
- `POST /api/process/{file_id}/reset` - Reset all steps

**Enhancement (MLX):**
- `GET /api/process/enhance/models` - List available models
- `POST /api/process/enhance/models/upload` - Upload new model
- `POST /api/process/enhance/models/select` - Select active model
- `DELETE /api/process/enhance/models/{filename}` - Delete model
- `POST /api/process/enhance/test` - Test model with debug output

## Critical Implementation Details

### Sanitisation with Disambiguation

The sanitisation step performs name linking to Obsidian-style wikilinks:
- First mention of each person becomes `[[Canonical Name]]`
- Subsequent mentions use the configured short nickname
- When an alias maps to multiple people (e.g., "Jack"), backend returns HTTP 409 with disambiguation options
- Frontend shows modal: "Apply" (this occurrence only) or "Apply to remaining" (this + rest of alias)
- Cancel button resets sanitise step without leaving UI stuck in processing state

**Configuration**: `backend/config/names.json` with schema:
```json
{
  "people": [
    {
      "canonical": "[[Full Name]]",
      "aliases": ["Alias1", "Alias2"],
      "short": "Nickname"
    }
  ]
}
```

### MLX Enhancement (Local AI)

- **Provider**: MLX (Apple Silicon only) via mlx-lm
- **Model storage**: `backend/resources/models/mlx/` (external paths disabled to avoid confusion)
- **External environment**: `/Users/tiurihartog/Hackerman/mlx-env` (auto-created by start script)
- **Streaming**: Uses SSE (Server-Sent Events) with fallback to simulated streaming if mlx-lm build lacks true streaming
- **Chat templates**: Optionally apply model's chat template via tokenizer for better prompt formatting
- **Token budget**: Dynamic token budget scales with input length (configurable ratio + min/max)

**SSE Events:**
- `start`: Connection established
- `plan`: JSON with `{ used_chat_template, effective_max_tokens, prompt_preview }`
- `token`: Incremental text chunks (emits `.` heartbeats when idle)
- `done`: Final full text + persisted to status.json
- `error`: Error message

### Audio Streaming and Highlighting

- **Media streaming**: Backend sets `Accept-Ranges: bytes` and handles HTTP 206 Partial Content for reliable Electron playback
- **CSP requirement**: Frontend `index.html` must include `media-src 'self' blob: http://localhost:8000 data: https:`
- **Word-level highlighting**: Uses `word_timings.json` (not SRT) for editor highlighting with requestAnimationFrame sync
- **Alignment strategy**: Greedy windowed mapping with joined-token matching for subword tokens (e.g., "Th"+"ier"+"ry" → "Thierry")

## Development Guidelines

### Code Quality

- **React best practices**: Declare variables before using in effects/callbacks to avoid "used before declaration" errors
- **API patterns**: Use heartbeat status updates (`lastActivityAt`) rather than progress percentages for long processes
- **Error handling**: Provide clear error messages when models/prompts are missing (no silent fallbacks)
- **Type safety**: Run `npm run type-check` before commits

### Debugging

1. **Backend issues**: Check `backend/backend.log` for stack traces
2. **Frontend issues**: View → Toggle Developer Tools in Electron
3. **API issues**: Use safe curl with timeouts (see commands above) or visit `http://localhost:8000/docs`
4. **Disambiguation stuck**: If sanitise modal won't dismiss, call `/api/files/{file_id}/sanitise/cancel`

### Making Changes

**Adding a new API endpoint:**
1. Add route to appropriate router in `backend/api/`
2. Implement business logic in `backend/services/`
3. Update frontend API client in `frontend/src/api.ts`
4. Update TypeScript interfaces if needed

**Adding a UI component:**
1. Create component in `frontend/components/`
2. Use Tailwind CSS for styling (consistent with existing components)
3. Follow existing patterns for API calls and error handling

### Known Limitations

- **Single file processing**: One transcription at a time (no parallel processing)
- **Platform**: macOS with Apple Silicon only (Metal/MLX requirement)
- **Highlighting edge cases**: Subword tokenization can cause occasional misalignment (mitigated with joined-token matching)
- **MLX compatibility**: Some mlx-lm builds ignore `temperature` or lack true streaming (app handles gracefully)

## Configuration Files

- `backend/config/settings.json` - Application settings (MLX params, timeouts, etc.)
- `backend/config/names.json` - People database for name linking
- `backend/modules/Enhancement/tags_whitelist.json` - Obsidian tags extracted from vault
- `.warpindexingignore` - Files to exclude from Warp codebase indexing

## Important Notes

- **MLX environment**: External Python environment at `/Users/tiurihartog/Hackerman/mlx-env` keeps repo clean
- **Startup optimization**: `start-background.sh` only rebuilds frontend if source files are newer than dist
- **Status tracking**: Use British spelling consistently (`sanitise`, `sanitising`, not `sanitize`)
- **Safe curl usage**: Always include `--connect-timeout 2 --max-time 5` (or longer for processing) to avoid hanging
- **Obsidian integration**: Export generates markdown with YAML frontmatter; tags constrained to vault whitelist (read-only)

## Git Workflow

```bash
# Before committing
cd frontend
npm run lint:fix
git add -A
git commit -m "feat: description"
```
