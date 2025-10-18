# Development Guide

## Development Setup

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

## Common Tasks

### Run in Development Mode
```bash
# Terminal 1: Backend
cd backend && python3 main.py

# Terminal 2: Frontend  
cd frontend && npm run dev
```

### Build for Production
```bash
cd frontend
npm run build
npm run dist    # Creates installer
```

### Run Tests
```bash
# Lint frontend
cd frontend && npm run lint

# Type check
npm run type-check
```

## Code Guidelines

### React Best Practices
```tsx
// ❌ Wrong: Variable used before declaration
useEffect(() => {
  console.log(myVar);  // Error!
}, []);
const myVar = "hello";

// ✅ Correct: Declare first
const myVar = "hello";
useEffect(() => {
  console.log(myVar);
}, [myVar]);
```

### API Patterns
```python
# Backend endpoint example
@router.post("/api/process/transcribe/{file_id}")
async def transcribe(file_id: str):
    # Start heartbeat updates
    status_tracker.update_activity(file_id)
    # Process file...
```

## Project Structure

```
backend/
├── main.py              # FastAPI app
├── api/                 # REST endpoints (8 routers)
│   ├── files.py
│   ├── processing.py
│   ├── transcribe.py
│   ├── sanitise.py
│   ├── enhance.py
│   ├── export.py
│   ├── system.py
│   └── config.py
├── services/            # Business logic
│   ├── transcription.py
│   ├── sanitisation.py
│   ├── enhancement.py
│   └── export.py
├── modules/             # External integrations
│   ├── mlx_runner.py
│   └── Transcription/
├── utils/               # Helpers
├── config/              # Settings
└── models.py            # Data models

frontend/
├── App.tsx              # Main app
├── components/          # UI components
├── main.js              # Electron entry
└── vite.config.ts       # Build config
```

## Adding Features

1. **New API Endpoint**: Add to `backend/api/`
2. **New UI Component**: Add to `frontend/components/`
3. **Update Types**: Modify `models.py` and TypeScript interfaces
4. **Test Locally**: Use dev mode before building

## Debugging

**Backend Logs:**
```bash
tail -f backend/backend.log
```

**Frontend Console:**
- View → Toggle Developer Tools in Electron

**API Testing:**
```bash
# List files (safe curl with timeouts per user preference)
curl --fail --show-error --silent --connect-timeout 2 --max-time 5 http://localhost:8000/api/files/

# API docs
open http://localhost:8000/docs
```

## API Reference (Consolidated)

Base URL: http://localhost:8000

- Files
  - POST /api/files/upload
  - GET  /api/files/
  - GET  /api/files/{file_id}
  - DELETE /api/files/{file_id}
  - GET  /api/files/{file_id}/status
  - GET  /api/files/{file_id}/content/{content_type}
    - content_type: transcript | sanitised | enhanced | exported | wts
  - PUT  /api/files/{file_id}/transcript
  - GET  /api/files/{file_id}/audio/{which}
    - which: processed | original
  - GET  /api/files/{file_id}/srt
  - GET  /api/files/{file_id}/word_timings
  - GET  /api/files/{file_id}/timeline
  - POST /api/files/{file_id}/sanitise/cancel
    - Cancel/reset only the sanitise step (used when closing the disambiguation modal)

- Processing
  - POST /api/process/transcribe/{file_id}
  - POST /api/process/sanitise/{file_id}
    - Returns 409 with { status: "needs_disambiguation", occurrences: [...] } if an alias maps to multiple people.
    - Do not mark processing on 409; wait for resolution.
  - POST /api/process/sanitise/{file_id}/resolve
    - Body: { session_id, decisions: [{ alias, offset, person_id, apply_to_remaining?: bool }] }
    - Earliest occurrence per person becomes [[Canonical]]; later ones use the short nickname.
  - POST /api/process/enhance/{file_id}
  - GET  /api/process/enhance/stream/{file_id}?prompt=...
  - POST /api/process/export/{file_id}
  - GET  /api/process/{file_id}/status
  - POST /api/process/{file_id}/cancel
    - Resets any steps in PROCESSING/ERROR back to PENDING and clears transient error/progress state.
  - POST /api/process/{file_id}/reset
    - Resets all steps to PENDING; clears sanitised/enhanced/exported. Transcript is preserved only if transcribe is DONE.

- Enhancement Model Management (MLX)
  - GET    /api/process/enhance/models
  - POST   /api/process/enhance/models/upload
  - POST   /api/process/enhance/models/select
  - DELETE /api/process/enhance/models/{filename}
  - POST   /api/process/enhance/test

Notes
- The editor highlights using word_timings.json; SRT is for export/viewing only.
- Sanitise Cancel behavior keeps the UI from getting stuck: call /api/files/{file_id}/sanitise/cancel when the disambiguation modal is dismissed.
- Prefer safe curl flags to avoid hanging requests:
```bash
curl --fail --show-error --silent --connect-timeout 2 --max-time 8 -X POST http://localhost:8000/api/files/{file_id}/sanitise/cancel
```

## Git Workflow

```bash
# Before commit
cd frontend && npm run lint:fix
git add -A
git commit -m "feat: description"
```

## Deployment

Currently manual - use `npm run dist` to create installers.

## Known Limitations

- Single file processing (no parallel)
- Mac only (Metal acceleration)
- Local only (no cloud sync)

## Enhancement – Developer Notes (Updated)

- Enhance runs fully offline and updates only `status.json` (field: `enhanced`).
- Presets live in Settings > Enhancement; we call them Instructions (not true system roles unless chat template is enabled).
- Local model execution:
  - Provider: MLX (Apple Silicon) via mlx-lm (in-process). Models folder: `backend/resources/models/mlx/`.
  - Selection is restricted to the app’s models folder. Upload or copy models there.
- APIs:
  - POST `/api/process/enhance/{file_id}` → non-streaming enhancement (requires `prompt`)
  - GET  `/api/process/enhance/stream/{file_id}?prompt=...` → SSE streaming enhancement
  - POST `/api/process/enhance/test` → test currently selected model; returns timing and debug fields
  - GET  `/api/process/enhance/models` | POST `/api/process/enhance/models/upload` | POST `/api/process/enhance/models/select` | DELETE `/api/process/enhance/models/{filename}`
- Export reads `status.json.enhanced` to produce markdown; Enhance itself does not write files.

### Streaming (SSE)
Endpoint: `GET /api/process/enhance/stream/{file_id}?prompt=...`
Events:
- `start`: connection established
- `plan`: JSON plan with `{ used_chat_template, effective_max_tokens, prompt_preview }`
- `token`: incremental text chunks; emits `.` heartbeats when idle
- `done`: final full text; backend persists `enhanced` and marks step done
- `error`: error message; backend sets step error

Note: If the installed mlx-lm does not support `stream=True`, the backend simulates progressive tokens while a single non-stream generation runs and emits the final result on `done`.

Frontend consumes via `new EventSource(`${API_BASE_URL}/api/process/enhance/stream/${fileId}?prompt=${encPrompt}`)` and appends `token` data to the right pane.

### Prompting and Chat Templates
- By default we build a plain prompt: `[Instruction]\n\nTranscript:\n...\n\nOutput:`
- When `enhancement.mlx.use_chat_template=true` and the model tokenizer exposes `chat_template`, we render:
  - messages = [{ role: system, content: Instruction }, { role: user, content: `Transcript: ...` }]
  - final prompt = `tokenizer.apply_chat_template(messages, tokenize=false, add_generation_prompt=true)`
- The test endpoint and the stream `plan` event report whether chat templating was used.

### Dynamic Token Budget
- Settings keys:
  - `enhancement.mlx.max_tokens` (hard cap)
  - `enhancement.mlx.dynamic_tokens` (bool)
  - `enhancement.mlx.dynamic_ratio` (default 1.2)
  - `enhancement.mlx.min_tokens` (default 256)
- Effective budget per run: `effective = min(max_tokens, max(min_tokens, input_tokens * ratio))`.
- Toggle dynamic off for a fixed cap.

### Sampling Params Compatibility
- The MLX runner introspects `mlx_lm.generate` and passes only supported kwargs.
- Many mlx-lm builds accept `**kwargs` but do not implement some knobs (e.g., `temperature`, `stream`, `stop`). The runner now proactively drops unsupported keys so max_tokens and core args are preserved without TypeErrors.
- Result: on the current environment, `temperature` and true streaming are not applied by mlx-lm; generation runs non-stream with max_tokens respected.

### Settings UI (Enhancement)
- Sliders: Max tokens (up to 8192), Temperature (may be ignored by some mlx-lm builds); persist on slider release.
- Advanced toggles: Use chat template, Dynamic token budget (with Ratio + Min tokens).
- Timeout: default is generous (1800s). Adjust `enhancement.mlx.timeout_seconds` if you need more/less headroom.
- Model Manager: upload/list/select/delete; selection restricted to app models folder.
- Test Model: shows `used_chat_template`, `effective_max_tokens`, and `prompt_preview`.
- Instructions: renamed from “System Prompt” to “Instruction” for clarity. Added default preset “Copy Edit (Fix Spelling/Grammar)”.

### Debug Tips
- Verify chat template: toggle it OFF/ON and run Test Model; check `used_chat_template` and `prompt_preview` shape.
- Verify tokens budget: watch the `plan` event at start of streaming; adjust Dynamic ratio or turn Dynamic off if needed.
- Heartbeats: should see `.` tokens during idle gaps while streaming.
- If long outputs still truncate, consider Chunked Copy Edit (process in paragraphs and stitch).

## Progress Update (2025-09-06)

Work done
- Sanitise settings UI simplified: three vertical sections (Name Linking, Filler Words, Cleanup) with concise helpers; removed legacy link style and enable toggles; preserved ellipses (…)
- Sanitise tab: split preview and improved Start UX; button styling fixes
- Enhancement (MLX-only):
  - Enhance tab restored to six settings-driven options; split view (Sanitised vs Enhanced)
  - Prompts are editable in Settings; selected option’s systemPrompt is sent to backend
  - Backend enhance endpoint uses MLX via mlx-lm with strict requirement: model + prompt required (no fallback). Saves enhanced to status.json and marks steps.enhance=done
  - MLX Model Manager added in Settings: upload/list/select/delete models in backend/resources/models/mlx, select existing external path (file or directory), and edit params (max tokens, temperature, timeout). Selected model path is displayed
  - Added model management API endpoints and frontend client methods
  - External Python venv for MLX bootstrapped automatically at /Users/tiurihartog/Hackerman/mlx-env (keeps repo clean)
- Export: confirmed it works without Enhance (uses sanitised text)

Where we are now
- MLX flow is wired end-to-end: prompt from preset → backend MLX runner → enhanced saved to status.json → export can use it
- Model Manager works for both uploaded files and external folders (e.g. LM Studio cache). Selected path is persisted in settings
- Start scripts will auto-create the external MLX env and install mlx-lm if missing

Next steps
- Add “Test Model” action in Settings to run a tiny generation (e.g., 32 tokens) to validate the selected model path loads
- Preload MLX params (max tokens, temperature, timeout) from backend settings on mount so UI matches saved values initially
- Enhance progress UX: optionally poll until enhance completes for more responsive updates (currently a quick refresh is used)
- Optional: scan common LM Studio folders and suggest detected model paths in a dropdown
- Optional: add inline prompt preview/edit at run time in Enhance tab

Known issues / caveats
- If mlx-lm is not installed or the selected model path is invalid, Enhance returns a clear 400/500 error; there is no deterministic fallback by design
- Some LM Studio snapshots are nested; if selecting the top folder doesn’t load, select the inner folder containing the config/weights
- Dynamic import warning from Vite about src/api.ts appearing as both dynamic and static import is benign; build completes successfully
- Permissions: the backend must be able to read the model path; ensure it’s accessible
- Apple Silicon and macOS version requirements apply to MLX; performance depends on hardware

## Open Issues and Next Session Plan (2025-09-04)

These are the items to pick up next time. They capture the current state observed in the app regarding the sanitise feature and related UI.

1) Sanitise tab: Start doesn’t reflect status update in UI
- Symptom: Clicking “Start Sanitisation” does not reliably move the file to “sanitising”/“sanitised” in the UI, and sanitised text may not appear.
- Current state:
  - Backend endpoint works: POST /api/process/sanitise/{file_id} returns status: done and updates steps.sanitise and sanitised text.
  - Frontend now calls HTTP in browser mode (no Electron) and sets immediate local status to sanitising, then refreshes.
  - UI uses British spelling: steps.sanitise and status === 'sanitising' (fixed typos).
- Hypotheses/Triage next:
  - Add a short post-start polling loop (like transcription) to force-refresh the file until steps.sanitise is 'done' or 'error'.
  - Verify transformBackendFile maps response into sanitised and steps.sanitise correctly for all files.
  - Confirm the polling cadence (1.5s during processing) is kicking in for the sanitising state.
  - Double-check any Electron vs browser divergence paths.
- Quick test commands (safe curl):
  - List files: curl --fail --show-error --silent --connect-timeout 2 --max-time 5 http://localhost:8000/api/files/
  - Start sanitise: curl --fail --show-error --silent --connect-timeout 2 --max-time 8 -X POST http://localhost:8000/api/process/sanitise/{file_id}

2) Names settings: Canonical input spacing regression (needs QA)
- We removed trimming while editing and deferred sorting until save; still needs verification that typing spaces is smooth under all conditions.
- Action: QA the Names tab editing UX and confirm no re-render disruptions while typing.

3) Sanitise preview enhancement: darker highlight for removed filler words
- Request: In the Sanitise tab, visually indicate deletions (e.g., filler word removals) with a darker/strikethrough style in the right-hand preview.
- Plan: Compute a lightweight diff between original vs sanitised; render deletions with a darker muted style, retain blue for [[...]] links.

4) Settings → Names: Reload removal and Save feedback
- We removed the “Reload” button and added a Saved ✓ timestamp + disabled state while saving.
- Action: Confirm usability and ensure loadNames remains accessible on initial mount.

5) Backend field naming mismatch (sanitised vs sanitized)
- Note: A legacy content endpoint references sanitized (American), while the main status flow uses sanitised (British) consistently.
- Action: Either normalise that endpoint to sanitised or avoid relying on it; primary UI uses the status object directly.

6) Nice-to-have: Add a force refresh button
- For debugging, optionally expose a UI “Refresh” control near the file list to force-fetch /api/files/ outside the polling cycle.
