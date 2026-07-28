import XCTest

/// `LiveRecordingDraft` + `LiveRecordingFinalize` — the pure math behind the Mac's live-take
/// draft and its stop-time finalize fork (`LiveRecordingSession`, `Pipeline/Recording/`).
/// Pure fixtures throughout: no mic, no model, no `ModelContext` — caption parts are injected
/// directly, exactly as `LiveCaptionEngine.captionParts()`/`finishParts()` would hand them to
/// the session.
///
/// `LiveRecordingSession` itself isn't reachable here (its `init` needs `ProcessingCoordinator`,
/// which lives in `Features/Shell` and needs the full FluidAudio/MLX app target) — these tests
/// pin the DECISIONS it hangs off instead: the absorb rule, the finalize composition for both
/// authorities, `everEdited`'s two triggers, and the refusal → phase mapping.
final class LiveRecordingDraftTests: XCTestCase {

    // MARK: - absorb: first commit from empty

    func testFirstCommitFromEmptyAppendsTheWholeChunk() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "hello world", committed: "hello world")
        XCTAssertEqual(draft.settledText, "hello world")
        XCTAssertEqual(draft.wetText, "")
        XCTAssertFalse(draft.everEdited, "an engine append must never set everEdited")
    }

    func testEmptyPollLeavesTheDraftUntouched() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "", committed: "")
        XCTAssertEqual(draft.settledText, "")
        XCTAssertEqual(draft.wetText, "")
    }

    // MARK: - absorb: a poll where only the wet tail changed

    func testWetOnlyPollDoesNotReappendTheSameCommittedChunk() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "hello", committed: "hello")   // first rotation
        XCTAssertEqual(draft.settledText, "hello")

        // committed unchanged, only the volatile re-transcribe of the new window changed.
        draft.absorb(full: "hello there", committed: "hello")
        XCTAssertEqual(draft.settledText, "hello", "an unchanged committed prefix must not re-append")
        XCTAssertEqual(draft.wetText, "there")
    }

    // MARK: - absorb: multiple rotations across polls

    func testASecondRotationAppendsOnlyTheNewSuffix() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "hello", committed: "hello")
        draft.absorb(full: "hello world", committed: "hello world")   // second rotation landed
        XCTAssertEqual(draft.settledText, "hello world")
    }

    // MARK: - absorb: empty tail

    func testEmptyTailWhenFullEqualsCommitted() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "hello", committed: "hello")
        XCTAssertEqual(draft.wetText, "", "nothing volatile beyond what's already committed")
    }

    // MARK: - edit: a person's own edit, and a later append surviving it

    func testEditSetsEverEditedAndReplacesSettledText() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "hello", committed: "hello")
        draft.edit(settledText: "hello, my own note")
        XCTAssertTrue(draft.everEdited)
        XCTAssertEqual(draft.settledText, "hello, my own note")
    }

    func testAnAppendAfterAnEditLandsAtTheEndAndTheEditSurvives() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "hello", committed: "hello")
        draft.edit(settledText: "hello, my own addition.")

        // The engine rotates further — the append must land at the end of the EDITED text,
        // not overwrite it.
        draft.absorb(full: "hello world", committed: "hello world")
        XCTAssertEqual(draft.settledText, "hello, my own addition. world")
        XCTAssertTrue(draft.everEdited, "everEdited never resets once a person has touched the draft")
    }

    func testEverEditedNeverResetsAfterFurtherEngineAppends() {
        var draft = LiveRecordingDraft()
        draft.edit(settledText: "typed before anything committed")
        draft.absorb(full: "typed before anything committed and more", committed: "and more")
        XCTAssertTrue(draft.everEdited)
    }

    // MARK: - pure statics directly (the rule table)

    func testNewSuffixDropsTheSharedPrefix() {
        XCTAssertEqual(LiveRecordingDraft.newSuffix(committed: "hello world", lastCommitted: "hello"), " world")
        XCTAssertEqual(LiveRecordingDraft.newSuffix(committed: "", lastCommitted: ""), "")
        XCTAssertEqual(LiveRecordingDraft.newSuffix(committed: "hello", lastCommitted: ""), "hello")
    }

    func testNewSuffixFallsBackToTheWholeValueOnAnEngineReset() {
        // committed no longer starts with what we last saw — shouldn't happen, but losing
        // words is worse than a rare duplicate.
        XCTAssertEqual(LiveRecordingDraft.newSuffix(committed: "restarted", lastCommitted: "hello world"), "restarted")
    }

    func testAppendedJoinsWithASingleSpaceOnlyWhenBothSidesHaveText() {
        XCTAssertEqual(LiveRecordingDraft.appended("", "hello"), "hello")
        XCTAssertEqual(LiveRecordingDraft.appended("hello", ""), "hello")
        XCTAssertEqual(LiveRecordingDraft.appended("hello", "world"), "hello world")
        XCTAssertEqual(LiveRecordingDraft.appended("hello", "  "), "hello", "a whitespace-only suffix appends nothing")
    }

    func testTailIsFullMinusItsCommittedPrefix() {
        XCTAssertEqual(LiveRecordingDraft.tail(full: "hello there", committed: "hello"), "there")
        XCTAssertEqual(LiveRecordingDraft.tail(full: "hello", committed: "hello"), "")
        XCTAssertEqual(LiveRecordingDraft.tail(full: "hello", committed: ""), "hello")
    }

    // MARK: - paragraph joins (phone-parity: a pause-rotated sentence boundary is a break)

    func testAParagraphJoinInTheSuffixSurvivesIntoSettledText() {
        XCTAssertEqual(LiveRecordingDraft.appended("First thought.", "\n\nSecond thought."),
                       "First thought.\n\nSecond thought.",
                       "the engine's pause-boundary paragraph break must not flatten to a space")
    }

    func testAbsorbCarriesTheEngineParagraphBreakThroughRotations() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "First thought.", committed: "First thought.")
        // The engine pause-rotated after a finished sentence → the next chunk arrives
        // joined with a paragraph break inside the committed string.
        draft.absorb(full: "First thought.\n\nSecond one. still wet",
                     committed: "First thought.\n\nSecond one.")
        XCTAssertEqual(draft.settledText, "First thought.\n\nSecond one.")
        XCTAssertEqual(draft.wetText, "still wet")
    }

    func testAParagraphBreakStillLandsAtTheEndOfAnEditedDraft() {
        var draft = LiveRecordingDraft()
        draft.absorb(full: "First thought.", committed: "First thought.")
        draft.edit(settledText: "First thought, fixed.")
        draft.absorb(full: "First thought.\n\nNext.", committed: "First thought.\n\nNext.")
        XCTAssertEqual(draft.settledText, "First thought, fixed.\n\nNext.",
                       "the append lands on the edited text, keeping its paragraph join")
    }

    // MARK: - LiveRecordingFinalize.transcript — both authorities' composition

    func testFinalizeJoinsSettledAndTailWithASingleSpace() {
        XCTAssertEqual(LiveRecordingFinalize.transcript(settledText: "hello world", finalTail: "goodbye"),
                      "hello world goodbye")
    }

    func testFinalizeHandlesEitherSideEmpty() {
        XCTAssertEqual(LiveRecordingFinalize.transcript(settledText: "", finalTail: "goodbye"), "goodbye")
        XCTAssertEqual(LiveRecordingFinalize.transcript(settledText: "hello world", finalTail: ""), "hello world")
        XCTAssertEqual(LiveRecordingFinalize.transcript(settledText: "", finalTail: ""), "")
    }

    func testFinalizeTrimsBothSides() {
        XCTAssertEqual(LiveRecordingFinalize.transcript(settledText: "  hello  ", finalTail: "  world  "),
                      "hello world")
    }

    // MARK: - LiveRecordingFinalize.refusal — the start/stop → phase mapping

    func testRefusalExtractsTheAssociatedValueFromAFailedState() {
        XCTAssertEqual(LiveRecordingFinalize.refusal(after: .failed(.noInputDevice)), .noInputDevice)
        XCTAssertEqual(LiveRecordingFinalize.refusal(after: .failed(.engineFailed("boom"))), .engineFailed("boom"))
    }

    func testRefusalIsNilForNonFailedStates() {
        XCTAssertNil(LiveRecordingFinalize.refusal(after: .idle))
        XCTAssertNil(LiveRecordingFinalize.refusal(after: .recording))
    }
}
