# ESCALATE — lane LIVE-UI — item 5's "✎ edited while recording" chip

## The question
Brief item 5 (m5, at rest): "The '✎ edited while recording' meta chip on the resting note is
rendered by the ordinary pane from the Memo's `transcriptUserEdited`... find the source of the
chips row; if it lives outside your file set, ESCALATE rather than reach." I found it and it's
a two-part miss, not just a wrong-file problem:

1. **The chip row itself** is `Features/Review/NoteProperties.swift`'s `metaChips` (lines
   62–82) — NOT in my ownership (`SidebarView.swift`, `RootView.swift`, NEW
   `Features/Recording/`, `Shell/Snapshot.swift`).
2. **The field to key it on doesn't exist where the chip would read it.** `transcriptUserEdited`
   is a `Memo` field (`Shared/Model/Memo.swift:77`) — but `metaChips` reads `file: PipelineFile`,
   and `PipelineFile` (`Models/PipelineFile.swift`) has NO mirrored bool at all. So this isn't
   just "add a chip in someone else's file" — it's "add a field to a model I don't own, then
   plumb it into a chip in a file I don't own."

## Evidence
- `grep transcriptUserEdited` across the repo: every hit is on `Memo` or `MemoNoteProjection`/
  `MacMemoAuthor`/`MemoCloudIngest` (all Pipeline/Ingest, not mine). Zero hits on `PipelineFile`.
- A Mac recording's resting note IS a `PipelineFile` (confirmed: `session.noteID` is documented
  as "the created `PipelineFile` id" in the frozen `LiveRecordingSession.swift`), so the chip
  needs the fact on that type, not on `Memo` alone — a synced local recording's `Memo` counterpart
  may carry `transcriptUserEdited`, but nothing today copies it onto the `PipelineFile` the pane
  actually renders.

## My best two options
**A. Add `PipelineFile.transcriptUserEdited: Bool = false`** (mirrors the `Memo` field,
   `isLocalRecording`'s own pattern one line above it), have `MemoNoteProjection`/whatever ingest
   path creates the local-recording `PipelineFile` copy it across, then add ONE `MacChip` in
   `NoteProperties.metaChips` reading it. Clean, but touches Models/PipelineFile.swift +
   Pipeline/Ingest/* + Features/Review/NoteProperties.swift — three files outside my ownership,
   two of them owned by DOCTRINE-adjacent lanes per BASE.md.

**B. Skip the model plumbing; derive it Mac-side from `session.everEdited` at stop-time only.**
   `LiveRecordingSession.stop()` (LIVE-ENGINE's file) already knows `everEdited` when it hands
   the take to `ArrivalPath.run` — if that write-path already sets `PipelineFile.transcriptUserEdited`
   (or reuses an existing flag) as part of finalizing, the chip in A becomes a pure read with no
   new plumbing on my side. This depends entirely on what LIVE-ENGINE's `stop()` already writes,
   which I can't see (empty skeleton body).

## Recommendation
Whoever fills `LiveRecordingSession.stop()` (LIVE-ENGINE) is already touching the finalize/
`ArrivalPath` write path and already holds `everEdited` — cheapest is for that lane (or the
conductor) to add the `PipelineFile` field as part of finalizing, then a ONE-LINE chip add in
`NoteProperties.metaChips` (mirroring the existing `remindAt`/`locked` chip conditionals right
next to it) closes this out. I did not add it myself to avoid guessing at a model/ingest
contract two other lanes own mid-batch.

## Everything else in the brief shipped
Items 1–4, 6, 7 are built (see wrap message) — this escalation blocks only the one chip, not
the rest of the surface.
