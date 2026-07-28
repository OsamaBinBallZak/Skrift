# Brief — lane LIVE-ENGINE (the Mac's live take: engine feed, draft, finalize)

Playbook: `LANE_PLAYBOOK.md` (read first, follow exactly). Base: `LANES-2026-07-28/BASE.md`
(the batch-1 ownership map there is superseded by THIS section for batch 2 — both batch-1
lanes are merged). Design: `mocks/mac-live-transcription.html` (m2 signed; m4 trimmed — stop
just stops). Research: `LANES-2026-07-28/RESEARCH_MIC.md`.

## Ownership (batch 2)
- `Skrift_Native/SkriftDesktop/Features/Shell/LiveRecordingSession.swift` — the conductor
  shipped this as a FROZEN API skeleton; you fill it. Extend by addition only: lane LIVE-UI
  compiles against exactly this surface.
- `Skrift_Native/SkriftDesktop/Engines/TranscriptionService.swift`
- `Skrift_Native/SkriftDesktop/Engines/MacRecorder.swift`
- `Skrift_Native/SkriftDesktop/Pipeline/Ingest/MacMemoAuthor.swift`
- NEW files under `Skrift_Native/SkriftDesktop/Pipeline/Recording/` (pure logic — this path
  is NOT yet in the test target's sources; if you add files here, add the path to
  `project.yml`'s `SkriftDesktopTests` sources — `project.yml` is granted for THAT edit only)
- Tests: NEW `SkriftDesktopTests/LiveRecordingDraftTests.swift`
- READ-ONLY as ever: `Shared/**` (the `LiveCaptionEngine` is yours to CALL, never edit),
  `ArrivalPath.swift` (its `Hooks` are injectable by design — that's your seam),
  `SidebarView.swift`/`RootView.swift` (lane LIVE-UI's).

## The feature (all pinned)

1. **Capture fan-out.** `MacRecorder` gains a second consumer beside the file writer: an
   optional `onLiveBuffer: ((AVAudioPCMBuffer) -> Void)?` invoked on the callback queue with
   an OWNED copy (`LiveCaptionEngine.copyBuffer`) — the capture buffer's storage is reused
   under us. Additive; the frozen public surface stays.
2. **Desktop caption streaming.** Mirror the phone's delegation shape on the desktop
   `TranscriptionService` (same file layout: `live = LiveCaptionEngine(log:)`, begin/feed/
   parts/finishParts/end wrappers, a `makeCaptionTranscriber()` over ITS `asr` with fresh
   `TdtDecoderState` per call, late-load recovery in `ensureLoaded`'s success path, transcriber
   cleared on unload). The phone's `Services/Transcription/TranscriptionService.swift` is the
   reference implementation — mirror it faithfully.
3. **The draft absorb rule (pure, heavily tested).** Track `lastCommitted: String`. Per poll
   with `(full, committed)`: committed only ever grows by appended chunks, so the new suffix =
   `committed` with the `lastCommitted` prefix removed; APPEND that suffix to `settledText`
   (at its end); `wetText` = `full` minus the `committed` prefix. User edits mutate
   `settledText` freely and set `everEdited`; engine appends must NOT set `everEdited`.
   Edge cases to pin with tests: first commit from empty; a poll where only wet changed; a
   user edit racing an append (append still lands at the end, edit survives); empty tail.
4. **The poll loop.** Self-pacing off `LiveCaptionEngine.pollDelay(afterSnapshotCost:thermal:)`
   — measure each `captionParts()` call's cost exactly like the phone's
   `startCaptionPolling` (`LiveRecordingService.swift:1366` is the reference). Cancel on
   stop/cancel/failure.
5. **Finalize (the ownership contract).**
   - Not edited → today's path VERBATIM: `ArrivalPath.run(asRecording: true,
     hooks: .live(...))` — the full-quality file pass replaces everything; live text may seed
     `pf.transcript` first so words never blink out.
   - Edited → settled text is FINAL for its region: `engine.finishParts().finalTail` closes
     the wet region; transcript = settled + " " + finalTail (single-space join, trimmed);
     write it to `pf.transcript`, `transcribeStatus = .done` BEFORE the arrival hooks run, and
     pass hooks whose `transcribe` is a NO-OP (the row already has its words — BatchRunner
     must never re-ASR it). The synced `Memo` gets the same transcript with
     `transcriptUserEdited = true` (extend `MacMemoAuthor` — its `markTranscribed` currently
     hard-codes `false` with a comment explaining why; an edited take is the case where `true`
     is the truth, and it makes the transcript TRUSTED cross-device).
   - Either way the take stays UNRATED (`isLocalRecording` machinery is already in place) and
     `noteID` publishes the created row id.
6. **Phases.** `.starting` until the first buffer, `.live`, `.settling` during finalize+arrival,
   `.idle` after, `.failed(refusal)` from any `MacRecorder` refusal (start OR stop verdicts).
   Cancel: recorder.cancel() + engine end + draft discard, no arrival.
7. **No UI.** Not one view file. Lane LIVE-UI renders your session.

## Tests (`LiveRecordingDraftTests.swift`)
The absorb rule's edges (point 3), the finalize composition for both authorities (edited /
not), everEdited semantics (engine appends don't set it; user writes do), phase transitions
for stop and cancel. Pure fixtures — no mic, no model: inject caption parts directly.

## Verify
No xcodebuild (playbook). Mirror-check against the phone's files where pinned. Wrap block per
playbook, uncertain-decisions table included.
