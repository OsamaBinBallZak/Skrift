# BASE — 2026-07-28 batch (Mac recording: capture core + unrated-take doctrine)

Base commit: 7e78053 (`fix(🎙): record on the wired mic while Bluetooth is around`).
This file existing in your worktree proves you're at/after the base. Report your base SHA.

## Context (both lanes read this once)

The Mac records (Record button, sidebar header). Two open problems:

1. **DOCTRINE** — an unrated Mac take renders as a LIT queue row ("Queued" chip), is counted
   in "Process N", and `needsProcessing()` would enhance it. The doctrine (stated in
   `SidebarView.openInPane`'s comment) is *"the RATING is what pipelines a memo"* — unrated
   phone memos never become pipeline rows and render as dim quiet rows. Mac takes are the
   first unrated FILES ever, and they walk straight past every gate. Tuur's call, verbatim:
   "pressing process shouldn't enhance unrated notes… do it the same as the phone."
2. **CAPTURE** (separate lane) — capturing from a specific, possibly-shared input device.
   Not your problem unless your brief says so.

## Ownership map (LAW — writes outside your set are forbidden)

### Lane DOCTRINE owns
- `Skrift_Native/SkriftDesktop/Features/Sidebar/SidebarView.swift`
- `Skrift_Native/SkriftDesktop/Pipeline/WayOutRules.swift`
- `Skrift_Native/SkriftDesktop/Features/Shell/ProcessingCoordinator.swift`
- `Skrift_Native/SkriftDesktop/Pipeline/Ingest/MemoNoteProjection.swift`
- `Skrift_Native/SkriftDesktop/SkriftDesktopTests/WayOutRulesTests.swift`
- NEW: `Skrift_Native/SkriftDesktop/SkriftDesktopTests/UnratedTakeTests.swift`

### Lane CAPTURE owns (briefed separately, later)
- `Skrift_Native/SkriftDesktop/Engines/MacRecorder.swift`
- NEW files under `Skrift_Native/SkriftDesktop/Engines/` only
- `Skrift_Native/SkriftDesktop/SkriftDesktopTests/MacRecorderRefusalTests.swift`

### Read-only for everyone (beyond the playbook's standing list)
- `Skrift_Native/SkriftDesktop/Pipeline/Ingest/ArrivalPath.swift` + `MacMemoAuthor.swift`
  + `MacCloudWriteBack.swift` (fresh this morning; escalate if they block you)
- `Skrift_Native/SkriftDesktop/Features/Shell/RunFile.swift`

## Cross-lane seams + pinned names
- `PipelineFile.isLocalRecording: Bool` — exists (Models/PipelineFile.swift), stamped at
  ingest for Mac takes. THE marker for "this file is a capture".
- **The unrated predicate is `SignificanceScale.litCount(pf.significance) == 0`** (Shared —
  handles the desktop's `nil` AND the phone's non-optional `0`). Never hand-roll it.
- Quiet-row meta copy comes from `MemoSpine.oneLiner` (Shared, read-only) — never hand-written.
- `WayOutRules.unpipelined` keeps its name; extend its signature rather than replacing it.
- DOCTRINE does not touch `Engines/`; CAPTURE does not touch the sidebar (the conductor wires
  transport UI after merge).
