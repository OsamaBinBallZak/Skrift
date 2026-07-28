# Plan — lane DOCTRINE (unrated Mac takes obey the unrated model)

Base SHA: `7e78053` (confirmed via `LANES-2026-07-28/BASE.md` present in worktree).

## Read findings that shape the plan

- `SidebarView.filtered` (= `model.visible(files)`, `AppModel.swift` — read-only) currently
  feeds `.file` rows unconditionally; `unpipelinedMemos` (`WayOutRules.unpipelined`) currently
  EXCLUDES any memo whose id has ANY pipeline row, including a quiet local take's own row. That's
  the exact bug: a local recording's row shows lit, and its twin `Memo` is excluded from the quiet
  list because "already ingested" today means "has a row at all," not "has a row worth showing."
- `ProcessingCoordinator.needsProcessing(_:)` today is just
  `pf.deletedAt == nil && pf.enhanceStatus != .done` — no unrated-local-recording refusal yet.
  `rowMenu`'s batch "Process N" (SidebarView.swift:871) and single-row "Process" (:884) both
  already gate through `coordinator.needsProcessing`, so extending that one function is sufficient
  for point 3 — confirmed by reading, no separate fix needed there.
- **Test-target constraint (forces a design choice):** `ProcessingCoordinator.swift` lives in
  `Features/Shell/` and is NOT a source of the MLX-free `SkriftDesktopTests` target
  (`project.yml`'s test target pulls `SkriftDesktopTests`, `Models`, `Pipeline`,
  `Features/Review/NoteMeasure.swift`, `Engines/MacRecorder.swift`, `Shared/*` only — the class
  itself pulls in `TranscriptionService`/`EnhancementService`/`DiarizationService`, i.e. MLX). I
  cannot exercise `ProcessingCoordinator.needsProcessing` from a host-less unit test as a method
  call on the class. Following the pattern `WayOutRules.swift`'s own header already documents
  (pure Pipeline-layer logic, thin Feature-layer callers — the `DesktopTrash` precedent), I'm
  extracting the actual boolean into a pure `WayOutRules.needsProcessing(_:)` and having
  `ProcessingCoordinator.needsProcessing` forward to it as a one-liner. Same name kept on the
  coordinator (external call sites at :303, :871, :884 don't change); the new pure copy is what
  `UnratedTakeTests.swift` exercises directly. This is a refactor inside my own two owned files,
  not a doctrine change — noting it in the wrap block's decision table rather than escalating.
- **Point 5 (rating loop) — verified by reading, not by writing new code.** `openInPane` just does
  `model.select(memo.id.uuidString)`; `RootView.activeFile` (read-only file) resolves
  `files.first { $0.id == model.activeID }` — since a local recording's REAL `PipelineFile` row
  already exists with `id == memo.id.uuidString` (BASE.md pinned fact), `activeFile` finds it
  directly and renders the real `NoteDisplayView` — `MemoNoteProjection`/`UnratedNotePane` is never
  invoked for a local take (that path is only for a memo with NO pipeline row at all). Rating
  there binds `SignificanceCircles(value: $file.significance)` (`NoteProperties.swift`, read-only)
  straight onto the REAL `pf.significance`, and `.onChange` calls
  `MacCloudMetaSync.setRating(new, for: file)`, which resolves the owning memo via
  `MacCloudWriteBack.resolve(for:in:)` — already store-resolved and already correct for
  `isLocalRecording` per the `memoID(for:)` doc comment (fixed 2026-07-28, same day). So: once
  `pf.significance` goes non-zero, `isQuietLocalTake(pf)` flips false on its own, and BOTH
  `queueRowFiles` (now includes it) and `unpipelinedMemos` (now excludes the twin memo, since my
  rewritten `unpipelined` checks `isQuietLocalTake(pf)` per-memo rather than blanket-excluding by
  id) flip together — the row moves from quiet to lit without any code of mine touching the
  rating write path. Nothing to fix inside my file set for this point; nothing broken outside it.

## Changes

1. **`WayOutRules.swift`**
   - Add `isUnratedLocalRecording(_ pf: PipelineFile) -> Bool` —
     `pf.isLocalRecording && SignificanceScale.litCount(pf.significance) == 0`.
   - Add `isQuietLocalTake(_ pf: PipelineFile) -> Bool` — the above AND error-free
     (`pf.transcribeStatus != .error && pf.error == nil`, matching the brief's own two-part
     "errored" definition literally rather than relying on them always being set in tandem).
   - Add `needsProcessing(_ pf: PipelineFile) -> Bool` — the extracted pure predicate:
     `pf.deletedAt == nil && pf.enhanceStatus != .done && !isUnratedLocalRecording(pf)`.
   - Rewrite `unpipelined(memos:files:now:)`: build an `id → PipelineFile` map (UUID-parseable
     ids only, same as today's `ingested` set) instead of a plain `Set<UUID>`; a memo passing the
     existing base guard (not deleted, `significance == 0`, not locked, not fading) is included
     when it has NO pipeline row at all (today's behavior) OR its pipeline row is a quiet local
     take (`isQuietLocalTake`). Comment updated to explain the new middle case; every existing
     test (`testUnpipelinedExcludesAlreadyIngestedMemos`, `…IgnoresNonUUIDPipelineFileIDs`, etc.)
     keeps passing unchanged since a default-constructed test fixture has `isLocalRecording ==
     false`.

2. **`ProcessingCoordinator.swift`**
   - `needsProcessing(_:)` body becomes `WayOutRules.needsProcessing(pf)`. No signature change,
     no call-site change.

3. **`SidebarView.swift`**
   - `pendingFiles`: add `&& coordinator.needsProcessing($0)` to the existing `queueStatus`
     filter, so "Process N" / `canProcess` / the Process button's id list stop counting an
     unrated local recording.
   - New `queueRowFiles: [PipelineFile] { filtered.filter { !WayOutRules.isQuietLocalTake($0) } }`;
     `orderedIDs` and `entries`'s `.file` mapping both switch from `filtered` to this, so a quiet
     local take never renders as a lit `QueueRowView` (and never lands in keyboard/shift-click
     ordering for rows that aren't shown).
   - No changes to `quietMemoRow`, `openInPane`, `visibleMemoRows`, or any context-menu code —
     they already do the right thing once membership is right.

4. **`MemoNoteProjection.swift`** — read fully; no change needed (point 5 above). Touching it
   only if the live-rating path had been broken, which it isn't.

## Tests

- `WayOutRulesTests.swift`: extend the "② band membership" section with a case where a memo's
  only pipeline row is a quiet local take (included) vs. a rated one (excluded, existing
  behavior) — cheap regression pin alongside the existing suite.
- New `UnratedTakeTests.swift` (`SkriftDesktopTests` target, MLX-free — `Pipeline/` sources only,
  no `Features/` import needed since the logic under test now lives in `WayOutRules`):
  - unrated error-free local recording: absent from `unpipelined` membership... no — PRESENT per
    the doctrine (quiet row) — precise cases spelled out below, matching the brief's four bullets:
    1. Unrated, error-free local recording: `isQuietLocalTake` true, `needsProcessing` false,
       its twin memo appears in `unpipelined` (quiet channel) even though a pipeline row exists.
    2. `needsProcessing` true for a RATED local recording.
    3. `needsProcessing` unaffected (true) for an ordinary rated import (`isLocalRecording ==
       false`, `significance` floored to 0.1) — the "imports floor to rated via the memo channel"
       guard against regression.
    4. Errored unrated local recording: `isQuietLocalTake` false (keeps its queue row + implicit
       Error chip via existing `queueStatus`), but `needsProcessing` still false (gate stays shut
       — only explicit per-row verbs may act on it).
    5. `litCount` edge restated at the `isUnratedLocalRecording` boundary: `nil` significance and
       `0.0` both read unrated (true); `0.1` reads rated (false) — this is really a
       `SignificanceScale` spot-check but pinned here since it's the exact boundary the doctrine
       leans on.

## Verify

Host-less mental-compile only (no xcodebuild per playbook). I'll re-read the finished diffs
against every call site of `unpipelined`, `needsProcessing`, `filtered`/`orderedIDs`/`entries`
before calling this done, and cite exact files:lines touched in the wrap block.
