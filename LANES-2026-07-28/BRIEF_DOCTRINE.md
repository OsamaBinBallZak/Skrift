# Brief — lane DOCTRINE (unrated Mac takes obey the unrated model)

Playbook: `LANE_PLAYBOOK.md` (read first, follow exactly). Base + ownership: `LANES-2026-07-28/BASE.md`.

## The feature

An unrated Mac take must behave like an unrated phone memo, everywhere the list and the
pipeline look at it. Today it renders as a lit queue row, counts into "Process N", and
`needsProcessing()` would enhance it. All decisions below are PINNED — build, don't re-litigate.

1. **Presentation.** A `PipelineFile` with `isLocalRecording && litCount(significance)==0 &&
   error == nil` leaves the queue-row channel entirely: its authored `Memo` (same UUID as
   `pf.id`) renders as a QUIET ROW instead — the existing `quietMemoRow` idiom (dim title,
   hollow circle, `MemoSpine` clock line). No new UI is invented; you are re-routing an
   existing row through an existing renderer, so no mock applies.
2. **Membership mechanics.** `WayOutRules.unpipelined` currently EXCLUDES any memo whose id has
   a pipeline row. Extend it so a memo whose pipeline row is an unrated, error-free local
   recording is INCLUDED (the pipeline row still exists — it holds the transcript — it just
   doesn't show as queue work). Keep the function's name; extend its inputs as needed.
3. **The Process gate.** `needsProcessing()` (ProcessingCoordinator) refuses an unrated local
   recording. `pendingFiles` / "Process N" / `canProcess` must not count them. Batch verbs
   (row menu "Process \(n)") inherit the gate automatically by going through `needsProcessing`
   — verify they do.
4. **Errors stay loud.** An errored take (`transcribeStatus == .error` or `error != nil`)
   KEEPS its queue row and Error chip even while unrated — a failed capture that quietly fades
   would bury a real failure. But the Process gate above still applies to it (only explicit
   per-row verbs may act on it).
5. **The rating loop must close.** Rating the quiet row (peek → SignificanceCircles → memo
   significance → the existing Q2 write-back onto `pf.significance`) must flip the note back
   into a lit queue row. Verify this path works for a local take (memo.id == pf.id, so the
   projection's matching should hold); if it's broken inside your file set, fix it; if the
   break is outside your set, ESCALATE per playbook.
6. **Out of scope.** The two legacy 08:4x takes have `isLocalRecording=0` (pre-flag) — the
   conductor migrates them; do not write a migration. `Engines/`, `ArrivalPath`, transport UI:
   not yours.

## Tests (new `UnratedTakeTests.swift` + extend `WayOutRulesTests.swift`)
- An unrated error-free local recording: absent from queue membership, present in quiet
  membership; its transcript-bearing pipeline row still exists.
- `needsProcessing` refuses it; a RATED local recording passes; an unrated IMPORT is
  unaffected (imports floor to rated via the memo channel — don't regress them).
- The errored unrated take: queue member with error surfaced, still refused by the gate.
- litCount edge: `nil` and `0.0` both read unrated; `0.1` reads rated.

## Verify
Host-less mental-compile care only (playbook: no xcodebuild). Cite the exact files:lines your
membership change touches in your wrap block.
