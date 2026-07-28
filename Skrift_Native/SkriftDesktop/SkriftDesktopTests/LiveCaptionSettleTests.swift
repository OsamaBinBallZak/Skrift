import XCTest

/// The settle policy — when live text turns white (= editable, on the m2 surface). The
/// research verdict (`LANES-2026-07-28/RESEARCH_DICTATION.md`): a detected PAUSE is the
/// primary signal (phrase-boundary settling, the Apple-dictation feel), the fixed interval
/// is only the ceiling, and the phone's timer-only behavior must stay byte-identical.
final class LiveCaptionSettleTests: XCTestCase {

    // ── the pause trigger ──

    func testAPhrasePauseSettlesTheChunk() {
        XCTAssertTrue(LiveCaptionEngine.shouldRotate(
            sinceRotation: 4, lastSnapshotCost: 0.2, interval: 7, silenceFor: 1.0),
            "a breath after a phrase is THE settle signal")
    }

    func testAMidSentenceMicroPauseDoesNot() {
        XCTAssertFalse(LiveCaptionEngine.shouldRotate(
            sinceRotation: 4, lastSnapshotCost: 0.2, interval: 7, silenceFor: 0.4),
            "0.4s is thinking-while-talking, not a phrase boundary")
    }

    func testAPauseOnATinyWindowDoesNotChurn() {
        XCTAssertFalse(LiveCaptionEngine.shouldRotate(
            sinceRotation: 1.0, lastSnapshotCost: 0.2, interval: 7, silenceFor: 1.5),
            "committing fragments pollutes the settled text with confetti")
    }

    // ── the ceiling still holds ──

    func testTheNonStopTalkerStillHitsTheCeiling() {
        XCTAssertTrue(LiveCaptionEngine.shouldRotate(
            sinceRotation: 7.1, lastSnapshotCost: 0.2, interval: 7, silenceFor: nil),
            "no pause ever — the interval is the safety net")
    }

    // ── phone-mode (timer only) is untouched ──

    func testTimerOnlyModeIgnoresSilenceEntirely() {
        XCTAssertFalse(LiveCaptionEngine.shouldRotate(
            sinceRotation: 20, lastSnapshotCost: 0.2, silenceFor: nil),
            "the phone's 25s default: 20s in, still accumulating")
        XCTAssertTrue(LiveCaptionEngine.shouldRotate(
            sinceRotation: 25.1, lastSnapshotCost: 0.2, silenceFor: nil))
    }

    func testTheHotHardwareEarlyRotateSurvives() {
        XCTAssertTrue(LiveCaptionEngine.shouldRotate(
            sinceRotation: 11, lastSnapshotCost: 1.3, silenceFor: nil),
            "expensive snapshots still force an early commit on old/hot hardware")
    }

    // ── the tuning constants carry their rationale ──

    func testPauseConstantsStayInTheResearchedBand() {
        XCTAssertGreaterThanOrEqual(LiveCaptionEngine.pauseHangover, 0.6,
            "below ~0.6s, mid-sentence pauses start settling wrong words into the user's editable text")
        XCTAssertLessThanOrEqual(LiveCaptionEngine.pauseHangover, 1.2,
            "beyond ~1.2s the settle lag stops feeling phrase-shaped (Deepgram's own band)")
        XCTAssertGreaterThanOrEqual(LiveCaptionEngine.minPauseWindow, 1.0)
    }
}
