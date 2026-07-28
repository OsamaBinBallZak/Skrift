# PLAN — lane LIVE-UI

Base SHA: `c7defa98132fda3ea5175a1c76882ffa2820882b` (BASE.md present, verified).
Consumes `Features/Shell/LiveRecordingSession.swift` exactly as frozen (skeleton bodies —
`start()`/`stop()`/`cancel()` are no-ops until LIVE-ENGINE lands; that's fine, I only need the
*shape*, not working behavior, to build + snapshot the UI).

## Files I touch
- NEW `Features/Recording/RecordingDraftView.swift` — the m1/m2/m4 surface.
- `Features/Sidebar/SidebarView.swift` — replace direct `MacRecorder` with the shared session.
- `Features/Shell/RootView.swift` — own the session, route the pane, select on idle.
- `Features/Shell/Snapshot.swift` — add `-snapshot-livedraft`; patch existing `SidebarView(...)`
  call sites to pass a fixture session (their behavior must not change).
- `project.yml` — NOT touched: `sources: [path: Features]` already covers `Features/Recording/**`
  recursively (verified: `SkriftDesktopTests` stays host-less, doesn't reference `Features/`
  except the two hand-picked pure files, so nothing there needs updating either).

## Key decisions

1. **Pure-fixture split for the draft body.** `RecordingDraftView` (takes `@Bindable var
   session: LiveRecordingSession`) is a thin shell around `RecordingDraftBody` — a value-only
   view (`phase`, `settledText: Binding<String>`, `wetText`, `everEdited`, `elapsedLabel`,
   `meter`, `onStop`). Mirrors the existing `ConnectionsPanelBody` idiom (Snapshot.swift's own
   comment: "a pure-view fixture injection — no engine, no ModelContext, mock-story rows").
   Necessary, not just tidy: the frozen `LiveRecordingSession`'s `phase`/`settledText`/etc. are
   `private(set)`/no-op-backed right now, so a snapshot can't drive a real session into `.live`/
   `.settling` — it CAN construct `RecordingDraftBody` directly with fixture values. This is also
   what makes `-snapshot-livedraft` possible at all against a skeleton API.

2. **RootView constructs `LiveRecordingSession` eagerly, not lazily.** `SharedStore.container`
   (App/SkriftDesktopApp.swift) is a static `ModelContainer` — the same one
   `.modelContainer(SharedStore.container)` binds into `\.modelContext`. So RootView's `init()`
   builds `coordinator` then `LiveRecordingSession(coordinator: coordinator, context:
   SharedStore.container.mainContext)` synchronously, avoiding an optional / task-deferred
   session that would flicker nil on first frame.

3. **Pane routing:** `switch liveSession.phase { case .starting, .live, .settling:
   RecordingDraftView(session:) ; default: <existing 3-way activeFile/UnratedNotePane/empty> }`.
   `.failed` is explicitly EXCLUDED from this switch (routes through `default`) — a refusal is
   not a draft state (brief item 6); it only ever shows via the sidebar's alert.

4. **Idle → select `noteID`:** `.onChange(of: liveSession.phase)` (no `initial:`) — when the new
   value is `.idle`, `model.select(id)` if `liveSession.noteID` is set. `RootView`'s existing
   3-way pane switch resolves whichever kind of note that id names (PipelineFile row or
   UnratedNotePane) — no new branch needed there, matching "there is no second renderer."

5. **Sidebar transport collapse:** the header shows the mini live-timer transport only for
   `.starting`/`.live`; `.settling` (and `.failed`/`.idle`) fall back to the ordinary Import/
   Record pair — matches m4's mock exactly (transport already gone, plain "Record" button).
   Stop button calls `Task { await session.stop() }`. Refusal handling: after `await
   session.start()`, if `session.phase` is `.failed(why)`, copy `why` into the existing
   `micProblem` alert state (same alert, same `micProblem` var) — no second alert, no explicit
   "clear" call needed (the frozen API has none): the stale `.failed` phase just sits inert
   until the next `start()`, and nothing routes on `.failed` per decision 3.

6. **Synthetic queue row:** a small `LiveTakeRow` in `RecordingDraftView.swift` (not a
   `PipelineFile`) — pinned above `queueRowFiles` in `SidebarView`'s `entries`, purely from
   `session.phase`/`elapsedLabel`/`settledText`. Title = "Recording…" while starting/live;
   during `.settling`, derives a title the same way the rest of the app does (first non-empty
   line of `settledText`, `NoteTitle.clip` — Shared, read-only, consumed not edited) so the row
   and the pane's `.settling` title agree.

7. **Meta chips reuse `MacContextChip`/`MacChip`** (declared in `NoteProperties.swift`, same
   module, not edited) and `SourceKind.voiceMemo` (Shared taxonomy) for the 🎙/"Voice memo"
   glyph+label, and `SkriftFormat.breadcrumbDate` for the date chip — no hand-rolled copies of
   either.

## Escalation (filed, not blocking the rest)

Item 5's "✎ edited while recording" chip on the AT-REST pane belongs in
`Features/Review/NoteProperties.swift`'s `metaChips` (found the source, per the brief's own
fallback instruction), which is outside my ownership — AND `PipelineFile` has no
`transcriptUserEdited`-equivalent field at all (only `Memo`, Shared, carries it) to key the chip
on. Writing `ESCALATE_LIVEUI.md` for this one item and building everything else (1–4, 6, 7).

## Verify
`-snapshot-livedraft <path>` — two stacked `RecordingDraftBody` fixtures (live w/ wet tail +
edited pill; settling w/ no transport, softer wet band, real-derived title). Cited in the wrap.
