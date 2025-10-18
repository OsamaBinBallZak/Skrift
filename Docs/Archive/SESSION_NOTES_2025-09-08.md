# Session Notes – 2025-09-08

This captures everything we changed today and what remains, so we can resume quickly.

## Backend

- MLX runner (backend/modules/mlx_runner.py)
  - Added safe kwargs filter for mlx-lm.generate (maps `temperature→temp` if needed; drops unknown keys)
  - Implemented chat template prompting via Hugging Face tokenizer when available:
    - messages: [{system: Instruction}, {user: `Transcript: ...`}]
    - `apply_chat_template(..., tokenize=False, add_generation_prompt=True)`
  - Implemented dynamic token budget:
    - `effective = min(max_tokens, max(min_tokens, input_tokens * ratio))`
    - Config keys: `enhancement.mlx.{max_tokens,dynamic_tokens,dynamic_ratio,min_tokens}`
  - Added `plan_generation()` helper returning `{ used_chat_template, effective_max_tokens, prompt_preview }`

- Processing API (backend/api/processing.py)
  - SSE endpoint `GET /api/process/enhance/stream/{file_id}?prompt=...` updated:
    - Emits events: `start`, `plan` (JSON), `token` (with heartbeat dots), `done`, `error`
    - Persists final enhanced text and marks `steps.enhance=done`
  - Test endpoint `POST /api/process/enhance/test` returns debug fields:
    - `used_chat_template`, `effective_max_tokens`, `prompt_preview`

- Settings schema (backend/config/settings.py)
  - Added keys: `use_chat_template` (default true), `dynamic_tokens` (true), `dynamic_ratio` (1.2), `min_tokens` (256)

## Frontend

- Settings → Enhancement (frontend/components/SettingsTab.tsx)
  - Sliders: Max tokens (cap 8192), Temperature; save on slider release
  - Advanced toggles: Use chat template; Dynamic token budget (+ Ratio & Min tokens inputs)
  - Test Model shows debug: used_chat_template, effective_max_tokens, prompt_preview
  - Renamed "System Prompt" to "Instruction" (and PREVIEW label)
  - Fix: `api.getConfig()` now unwraps `res.config` so saved values load correctly

- Enhance tab (frontend/components/EnhanceTab.tsx)
  - Streams via SSE; shows tokens live; includes Stop button
  - Heartbeats restored (dots) while no tokens arrive

- Enhancement presets (frontend/components/EnhancementConfigContext.tsx)
  - Added default "Copy Edit (Fix Spelling/Grammar)" preset; made default option

## Model Management

- Selection restricted to app models folder: `backend/resources/models/mlx/`
- Settings: “Test Model” quickly validates selected model

## Docs updated

- README.md: added MLX enhancement + streaming pointers
- QUICK_START.md: updated model manager flow, Test Model, toggles
- ARCHITECTURE.md: added Streaming, Prompt Composition (chat template), Token Budget
- DEVELOPMENT.md: full developer notes on SSE, chat template, dynamic tokens, settings, debug

## Known Issues / Next Steps

1) Truncation persists on long edits for Qwen3-4b-Instruct-2507-MLX-8bit
- Even with high `max_tokens`, generation may stop early (EOS or model behavior)
- Action options:
  - Turn Dynamic token budget OFF or increase ratio to 2.0+ and retry
  - Lower Temperature to 0.2 for deterministic editing results
  - Implement Chunked Copy Edit: token-aware paragraph segmentation, independent edits, then stitch
    - Backend: add `enhancement.chunked=true` option; implement chunking + overlap, stream stitched result
    - Frontend: add checkbox in Enhance; surface basic chunk stats in `plan`

2) Optional: Surface the `plan` event in the Enhance UI
- Show `used_chat_template` and `effective_max_tokens` at stream start to aid debugging

3) Optional: Per-preset sampling
- Allow each Instruction to override temperature/max_tokens

4) Optional: Friendly preamble preset
- If desired, add a variant Instruction that includes a friendly preamble similar to LM Studio

## How to resume

- Verify Settings → Enhancement values (Max tokens, Temperature, Chat template, Dynamic token budget)
- Use Test Model; confirm `used_chat_template=true` and check `effective_max_tokens`
- Run a Copy Edit on the same transcript and observe the stream (dots + tokens)
- If still truncated, choose either higher ratio or OFF for dynamic, and/or proceed with Chunked Copy Edit implementation

