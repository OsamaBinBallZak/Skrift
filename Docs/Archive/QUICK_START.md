# Quick Start Guide

## Prerequisites

- Mac with Apple Silicon (M1/M2/M3/M4)
- Python 3.8+
- Node.js 18+
- ~5GB free space for models

## First Time Setup

```bash
# 1. Clone/navigate to project
cd "THE APP V2.0"

# 2. Install backend dependencies
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 3. Install frontend dependencies
cd frontend
npm install
cd ..
```

## Running the App

MLX environment (one-time, auto)\
On first start, the backend will create an external Python environment at:
```
/Users/tiurihartog/Hackerman/mlx-env
```
It installs mlx-lm there and always uses this interpreter to keep the repo portable.

```bash
# Start everything (from project root)
./start-background.sh

# Check if running
./status.sh

# Stop when done
./stop-all.sh
```

## Using the App

MLX model selection (Enhancement)
- Settings → Enhancement → Local Model (MLX)
- Upload a model, or copy a model folder into `backend/resources/models/mlx/` and click Refresh. Select a model from the list.
- External arbitrary paths are disabled to avoid confusion. Keep models inside the app’s models folder.
- Click “Test Model” to verify the selected model loads and can generate quickly.
- Adjust Max tokens / Temperature / Timeout as needed. Note: some mlx-lm builds ignore `temperature`; true streaming may be unavailable (the app simulates progressive output). (Advanced: toggle Chat Template + Dynamic Token Budget.)
- Enhance tab uses the selected model and your chosen Instruction. If no model/prompt, Enhance will return a clear error.

1. **Upload Audio**
   - Click Upload tab
   - Drag .m4a files into the drop zone
   - Files appear in "Files to Upload" list

2. **Transcribe**
   - Click Transcribe tab
   - Select a file from dropdown
   - Click blue "Start Transcription" button
   - Wait for "Transcribing..." status
   - Transcript appears when done

3. **Monitor Status**
   - Shows last activity time
   - Warning appears if stuck (>2 min)
   - Can cancel/retry if needed

## Output Location

Transcripts are saved to:
```
~/Documents/Voice Transcription Pipeline Audio Output/
```

## Troubleshooting

Processed WAV shows 0:00 or won’t play
- Ensure you are on a build with media streaming fixes:
  - Backend audio endpoints support 206 byte-range (Partial Content) and set `Accept-Ranges: bytes`.
  - Frontend CSP allows media from http://localhost:8000 (`media-src 'self' blob: http://localhost:8000 data: https:`).
  - Responses use `Content-Disposition: inline` and `Cache-Control: no-store` to avoid stale media.
- The Sanitise tab player targets `processed.wav` via `GET /api/files/{file_id}/audio/processed`.
- If you manually changed CSP or are running in a different host/port, update `media-src` accordingly.

Highlight looks off or stops early
- The highlighter uses word_timings.json and a requestAnimationFrame loop with small hysteresis. Re‑transcribe if word_timings.json is missing.
- Edited/inserted words are displayed but skipped until aligned (no timing).
- If a specific word doesn’t highlight and should, it’s usually a tokenization quirk; increasing the join window/max join length can help. Distinct nicknames (short) also make mapping clearer.

Disambiguation during Sanitise
- If an alias maps to multiple people (e.g., “Jack”), a disambiguation window appears:
  - Apply → assign just this occurrence
  - Apply to remaining → assign this occurrence and the rest of that alias for this file
- For each person independently, the earliest assigned occurrence becomes [[Canonical]]; later ones use the short nickname.
- Cancel closes the window and resets the sanitise step; you can run Sanitise again later.

**App won't start?**
```bash
./stop-all.sh           # Stop any existing instances
./start-background.sh   # Start fresh
```

**Port 8000 already in use?**
```bash
lsof -ti:8000 | xargs kill -9
```

**Need logs?**
```bash
tail -f backend/backend.log
tail -f frontend/frontend.log
```

## Next Steps

- Multiple file batch processing works
- Text sanitisation: first-mention name linking to Obsidian [[Canonical]]
- Local AI enhancement (MLX): polish/concise presets running offline via Apple’s MLX; result saved to status.json for Export
- Export: generates enhanced.md from the saved enhanced text
