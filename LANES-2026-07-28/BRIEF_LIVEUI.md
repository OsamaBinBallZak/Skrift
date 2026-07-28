# Brief — lane LIVE-UI (the m2 surface: the note pane is the recording surface)

Playbook: `LANE_PLAYBOOK.md` (read first, follow exactly). Base: `LANES-2026-07-28/BASE.md`
(batch-1 ownership superseded; batch-2 map below). **The signed mock IS the spec:**
`Skrift_Native/SkriftDesktop/mocks/mac-live-transcription.html` — m1/m2 (live), m4 (stop,
TRIMMED: stop just stops, no narration), m5 (at rest). Open it in a browser and match it.

## Ownership (batch 2)
- `Skrift_Native/SkriftDesktop/Features/Sidebar/SidebarView.swift`
- `Skrift_Native/SkriftDesktop/Features/Shell/RootView.swift`
- NEW: `Skrift_Native/SkriftDesktop/Features/Recording/` (your view files —
  `RecordingDraftView.swift` etc.). Add the path to `project.yml`'s app-target sources if
  xcodegen's globs don't already cover `Features/**` (check first; `project.yml` granted for
  that edit only).
- `Skrift_Native/SkriftDesktop/Features/Shell/Snapshot.swift` — ADD a `-snapshot-livedraft`
  render of the draft view in its live + settling states (fixture-driven), matching the
  existing snapshot idioms. Verification depends on it.
- READ-ONLY: `Features/Shell/LiveRecordingSession.swift` — the FROZEN API you consume
  (filled by lane LIVE-ENGINE in parallel; compile against the skeleton's surface exactly).
  `Engines/**`, `Shared/**`, `ArrivalPath`, the mocks.

## The feature (all pinned by the mock)

1. **Record press → the pane becomes the draft** (m1/m2): `RootView` routes the detail pane
   to `RecordingDraftView` while `session.phase` is `.starting/.live/.settling`. The view:
   the slim transport docked top-left (red dot · `elapsedLabel` · the small meter ·
   stop button — same visual weight as the mock), the italic placeholder title
   ("First words become the title…"), the meta chips (date · Voice memo · running duration),
   the "Not rated — record first, judge later" line, and the BODY.
2. **The body = settled + wet** (m2): a `TextEditor`-style editable region bound to
   `session.settledText` (user edits flow through the session's setter — that is what flips
   authority; you never track edits yourself), followed by the wet tail rendered dim-italic
   with the soft accent band and the pulsing caret, NOT editable. After the first edit, show
   the ownership pill under the body ("✎ Your text now — Skrift keeps appending, but never
   rewrites what's settled") exactly as mocked.
3. **The sidebar while live** (m1/m2): the Record button becomes the small red live timer
   (dot + elapsed, still a button — pressing it is Stop); a synthetic "Recording…" row pinned
   at the top of the list (selected style, red pulsing dot), which is NOT a PipelineFile —
   purely presentational from `session.phase`.
4. **Stop just stops** (m4, Tuur-trimmed): transport vanishes; body keeps the wet band on the
   tail during `.settling`; the synthetic row shows "settling…". NO status line, NO
   "finishing words" copy anywhere.
5. **At rest** (m5): when `phase` returns to `.idle`, route back to the ordinary note pane,
   select `session.noteID` (the quiet unrated row idiom from the doctrine lane takes it from
   there — do not restyle it). The "✎ edited while recording" meta chip on the resting note
   is rendered by the ordinary pane from the Memo's `transcriptUserEdited` — add that one chip
   where the pane builds its meta chips (find the source of the chips row; if it lives outside
   your file set, ESCALATE rather than reach).
6. **Refusals unchanged:** `.failed(refusal)` surfaces through the existing "Can't record"
   alert machinery in `SidebarView` — reuse `micProblem`, don't invent a second alert.
7. **Session ownership:** `RootView` owns ONE `LiveRecordingSession` (`@State`), hands it to
   the sidebar (Record/stop buttons) and the pane (draft view). `SidebarView`'s existing
   `recorder`/`startRecording`/`stopRecording` wiring is REPLACED by session calls — delete
   the direct `MacRecorder` use from the view (the session owns the recorder now; lane
   LIVE-ENGINE guarantees the same refusal surface).

## Verify
`-snapshot-livedraft` renders (live with wet tail + pill, and settling) — cite the file:lines
in your wrap. No xcodebuild (playbook; the conductor gates + vision-checks your snapshot).
