# THE APP V2.0
*Audio Transcription Pipeline with Metal Acceleration*

## What It Does

Transcribes iPhone voice recordings (.m4a files) to text using Metal-accelerated Whisper on Mac, and locally enhances text with an MLX model (no cloud).

**Current features:**
- Drag-and-drop file upload
- Fast transcription (~2-3x realtime)
- Real-time status tracking (heartbeat-style)
- Local AI enhancement (MLX). SSE endpoint provided; on some MLX builds without true streaming support, the app simulates progressive output and persists the final result
- Test Model button to validate load/generation quickly
- Model Manager (app-local models folder)
- Clean, compact UI

## Quick Start

```bash
# From project root
./start-background.sh    # Start everything
./status.sh              # Check status
./stop-all.sh            # Stop when done
```

Then open the Electron app and:
1. Go to Upload tab → drag in .m4a files
2. Go to Transcribe tab → select file → click "Start Transcription"
3. Wait for completion (shows "Transcribing..." with activity time)
4. View your transcript

## Project Structure

```
THE APP V2.0/
├── backend/          # FastAPI server (Python)
│   ├── api/          # 8 router modules
│   ├── services/     # Business logic
│   ├── modules/      # MLX + Whisper
│   └── config/       # Settings
├── frontend/         # Electron + React UI
├── Docs/             # Documentation
├── start-background.sh
├── status.sh
└── stop-all.sh
```

## Documentation

- **[`QUICK_START.md`](./QUICK_START.md)** - Getting started guide
- **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** - Technical details (includes streaming + chat template prompting)
- **[`DEVELOPMENT.md`](./DEVELOPMENT.md)** - For developers (SSE, debug, settings)

## Sanitise and Name Linking

- Purpose: link people by replacing the earliest mention per person with [[Canonical Name]] and later mentions with a short nickname.
- Disambiguation: if an alias maps to multiple people, a modal appears with Apply and Apply to remaining. Apply to remaining fast-forwards through the rest of that alias for this run.
- Cancel: closes the modal and resets the sanitise step so the UI never gets stuck in processing.
- Highlights: the editor uses word_timings.json for live highlighting. Real SRT files are generated only for export/viewing.
- UI details: canonical label is styled for visibility (dark green text on subtle green background).

---
*Status: Production-ready for solo transcription. Multi-speaker support coming soon.*
