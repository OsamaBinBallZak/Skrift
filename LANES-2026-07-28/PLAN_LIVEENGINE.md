# PLAN — lane LIVE-ENGINE

Base: c7defa9 (`lanes: LIVE-ENGINE + LIVE-UI briefs + the frozen LiveRecordingSession API
skeleton`). Batch 2 ownership (`BRIEF_LIVEENGINE.md`) supersedes `BASE.md`'s batch-1 map.

## Read done
`LiveCaptionEngine.swift` (engine contract), phone `TranscriptionService.swift` (streaming
delegation shape to mirror), phone `LiveRecordingService.swift:1367` (`startCaptionPolling`,
the poll-pacing loop to mirror), the frozen `LiveRecordingSession.swift` skeleton,
`MacRecorder.swift`, `MacMemoAuthor.swift`, `ArrivalPath.swift` + `ArrivalPath+Live.swift`
(read-only — the `Hooks` seam), `ProcessingCoordinator.swift` (read-only —
`transcribe(fileIDs:context:)` is the real ASR hook; `reflectTranscripts`'s
`(memo.transcript ?? "").isEmpty` guard is load-bearing, see decision below), `SidebarView.swift`
(today's exact Record-button call: `ingest([url], asRecording: true)` →
`ArrivalPath.run(hooks: .live(coordinator:, context:))` — this IS "today's path VERBATIM").
`Memo.swift`/`PipelineFile.swift` fields (`transcriptUserEdited`, `isLocalRecording`,
`transcribeStatus`), `project.yml`'s `SkriftDesktopTests` sources.

## Design

### 1. Pure logic (NEW `Pipeline/Recording/`)
- `LiveRecordingDraft.swift` — a value type (`settledText`/`wetText`/`everEdited` +
  private `lastCommitted`) with `mutating func absorb(full:committed:)` (engine poll, never
  sets `everEdited`) and `mutating func edit(settledText:)` (a person's own edit, always
  sets it). Pure statics `newSuffix`/`appended`/`tail` carry the absorb math, unit-tested
  directly.
- `LiveRecordingFinalize.swift` — `transcript(settledText:finalTail:)`: single-space join,
  both sides trimmed. Used for BOTH the edited take's final transcript and (reused, same
  shape) the not-edited take's live-text seed.

### 2. `LiveRecordingSession` (fill the frozen skeleton)
`settledText`/`wetText`/`everEdited` become thin computed proxies over a private
`var draft: LiveRecordingDraft` — one source of truth, and `@Observable` tracks straight
through the nested value-type mutation (same pattern as any `@Observable` class holding a
struct). `elapsed`/`meter` proxy to the owned `private let recorder = MacRecorder()`
directly (no separate polling timer needed — nested `@Observable` reads track correctly).
- `start()`: set `recorder.onLiveBuffer` (fan-out closure, below) BEFORE `recorder.start()`
  (it reads the closure while building the capture session); on refusal → `.failed`
  (mirrors `SidebarView.startRecording`'s existing pattern incl. `clearFailure()`);
  on success → `TranscriptionService.shared.beginStream()`, `.live`, start the poll loop.
- Poll loop: mirrors `LiveRecordingService.startCaptionPolling` — measure
  `liveCaptionParts()`'s cost, `draft.absorb(full:committed:)`, pace the next iteration via
  `LiveCaptionEngine.pollDelay(afterSnapshotCost:thermal:)`. Cancels when `phase != .live`.
- `stop()`: `.settling`, cancel the poll, `recorder.stop()` (nil/`.failed` handled exactly
  like a dead take today). Then the ownership fork (design decision below) →
  `ArrivalPath.run(urls: [url], asRecording: true, ...)`, `noteID` ← created row id, `.idle`.
- `cancel()`: cancel poll, `recorder.cancel()`, fire-and-forget `endStream()`, reset the
  draft, `.idle`. (Mirrors `MacRecorder.cancel()`'s own idempotency — no extra guards
  needed; `MacRecorder.stop()`/`.cancel()` are already safe to call twice.)

### 3. `MacRecorder` — capture fan-out (additive)
New `var onLiveBuffer: ((AVAudioPCMBuffer) -> Void)?`, read into `SampleSink`'s init
(new optional param, default nil) and invoked from `captureOutput` with
`LiveCaptionEngine.copyBuffer(pcm)` — an owned copy, same discipline as the phone's tap,
even though this capture path already allocates `pcm` fresh per callback (belt-and-braces,
matches the brief literally + keeps the two apps' contracts symmetric).

### 4. Desktop `TranscriptionService` — streaming delegation (additive)
Mirrors the phone's shape 1:1: `private let live = LiveCaptionEngine(log:)` (an `os.Logger`
closure, not `DevLog` — Mac-side), `beginStream()/feedStream()/liveCaption()/
liveCaptionParts()/finishStreamParts()/endStream()`, `makeCaptionTranscriber()` over `asr`
with a fresh `TdtDecoderState` per call. Late-load recovery appended to `ensureLoaded`'s
success path (`if self.streaming { await self.live.setTranscriber(...) }`); `unload()`
gains `Task { await live.setTranscriber(nil) }`. `finishStreamParts()` (not a plain
`finishStream()`) because the edited-take finalize needs the split `finalTail`, unlike the
phone which never uses `finish`/`finishParts` at all (its stop always re-ASRs the whole
file).

### 5. `MacMemoAuthor` — `transcriptUserEdited` (additive)
`markTranscribed` gains a `userEdited: Bool = false` param (default preserves
`reflectTranscripts`'s existing call unchanged). `author()`'s call passes
`userEdited: pf.isLocalRecording` — see decision below for why that's a safe, correct
derivation given `ArrivalPath.run`'s call site is frozen (no new param reaches it).

### 6. `project.yml`
Add `- path: Pipeline/Recording` to `SkriftDesktopTests.sources` (granted, for this new
NEW pure-logic folder only).

### 7. Tests — `SkriftDesktopTests/LiveRecordingDraftTests.swift`
Pure fixtures only, per brief: `LiveRecordingDraft`'s absorb edges (first commit from
empty, wet-only poll, edit-then-append survival, empty tail) + `LiveRecordingFinalize`'s
join (both empty/one empty/both present, whitespace). No mic, no model, no ModelContext.

## Design decisions worth flagging (not escalating — reasoned through, documented here and
in the wrap block)

1. **Where the not-edited take's live-text seed happens.** The brief says "live text may
   seed `pf.transcript` first so words never blink out." Seeding it in `onCreated` (before
   `ArrivalPath.run`'s internal `MacMemoAuthor.author()` call) would make `author()` stamp
   the Memo's transcript at Memo-creation time — and `reflectTranscripts` only updates a
   Memo whose transcript is still EMPTY, so the real full-quality pass would never reach
   the phone once seeded that early: a durable regression, not just a cosmetic one. Seeding
   instead inside the wrapped `hooks.transcribe` (after `author()` has already run with an
   empty transcript, right as the real ASR pass begins) gets the same "no blink" locally
   while leaving the Memo's transcript empty at authoring time, so `reflectTranscripts`
   still fires once the real pass lands. Today's path (unedited) still reaches
   `coordinator.transcribe` unmodified in substance — only wrapped to inject one line.

2. **Deriving `transcriptUserEdited` without a new parameter reaching `author()`'s frozen
   caller.** `ArrivalPath.run`'s internal `MacMemoAuthor.author(...)` call is fixed (I don't
   own `ArrivalPath.swift`), so `userEdited` can't be threaded through as an explicit
   argument from `LiveRecordingSession`. Instead `author()` derives it from state already
   true by the time it runs: `pf.isLocalRecording && pf.transcript` already non-empty. That
   combination is otherwise impossible at `author()`-time — an ordinary (unedited) live
   recording's transcript is seeded later (decision 1, above); an imported file's
   `isLocalRecording` is false even if `backfill()` races in after Process already ran.
   The one known pre-existing hazard this inherits: `ArrivalPath.run`'s own doc names a
   race where the reconcile sweep's `backfill()` can author the Memo BEFORE `ArrivalPath`'s
   own call does ("proven by `-recordingest`... the sweep authored the take's Memo at 0.1
   before the capture path could"). If that sweep wins on an edited take, it would author
   with `pf.transcript` still empty (since I seed after `onCreated`, before the sweep would
   see it... actually the seed for the EDITED case happens IN `onCreated`, i.e. as early as
   possible) — this narrows the race window for the edited case specifically to before
   `onCreated` runs, which is the same window the existing significance race already lives
   in. Not solving that pre-existing race is consistent with how the codebase already
   tolerates it (documented, not eliminated).

## Verify
No xcodebuild (playbook — EDIT-ONLY). Mirror-checked against the phone's
`TranscriptionService`/`LiveRecordingService` file-by-file. Full build + `-recordingest`
device-adjacent verification is the conductor's merge-gate job.
