import XCTest

/// The settle policy — when live text turns white (= editable, on the m2 surface). The
/// research verdict (`LANES-2026-07-28/RESEARCH_DICTATION.md`): a detected PAUSE is the
/// primary signal (phrase-boundary settling, the Apple-dictation feel), the fixed interval
/// is only the ceiling, and the phone's timer-only behavior must stay byte-identical.
///
/// HOW a pause is detected changed on 2026-07-28, twice, on live-take evidence: RMS
/// thresholds (fixed, then adaptive) both failed on a real USB mic whose silence ripples
/// through the same 0.16–0.33 band as its quiet speech. The pause signal is now TEXT
/// STABILITY — identical consecutive decodes of the live window — which no microphone can
/// confuse (`LiveCaptionEngine.settleOnStability`).
final class LiveCaptionSettleTests: XCTestCase {

    // ── the stability settle (the primary signal) ──

    func testTwoIdenticalDecodesSettleTheChunk() {
        XCTAssertTrue(LiveCaptionEngine.settleOnStability(stablePolls: 2, windowSeconds: 5),
            "no new words for a full poll cycle IS the phrase pause")
    }

    func testASingleDecodeIsJustANewDecode() {
        XCTAssertFalse(LiveCaptionEngine.settleOnStability(stablePolls: 1, windowSeconds: 5),
            "one poll of 'stability' only means a decode landed — nothing has confirmed it")
    }

    func testAStablePauseOnATinyWindowDoesNotChurn() {
        XCTAssertFalse(LiveCaptionEngine.settleOnStability(stablePolls: 3, windowSeconds: 1.0),
            "committing fragments pollutes the settled text with confetti")
    }

    // ── the poll-time triggers (ceiling + cost; pause never comes from here) ──

    func testTheNonStopTalkerStillHitsTheCeiling() {
        XCTAssertEqual(LiveCaptionEngine.rotationTrigger(
            sinceRotation: 20.1, lastSnapshotCost: 0.2, interval: 20), .ceiling,
            "no pause ever — the interval is the safety net")
    }

    func testTheHotHardwareEarlyRotateSurvives() {
        XCTAssertEqual(LiveCaptionEngine.rotationTrigger(
            sinceRotation: 11, lastSnapshotCost: 1.3), .cost,
            "expensive snapshots still force an early commit on old/hot hardware")
    }

    func testAYoungCheapWindowRotatesForNoReason() {
        XCTAssertNil(LiveCaptionEngine.rotationTrigger(
            sinceRotation: 4, lastSnapshotCost: 0.2, interval: 20))
    }

    // ── phone-mode (timer only) is untouched ──

    func testTimerOnlyModeStillRotatesOnTheDefaultInterval() {
        XCTAssertFalse(LiveCaptionEngine.shouldRotate(sinceRotation: 20, lastSnapshotCost: 0.2),
            "the phone's 25s default: 20s in, still accumulating")
        XCTAssertTrue(LiveCaptionEngine.shouldRotate(sinceRotation: 25.1, lastSnapshotCost: 0.2))
    }

    // ── paragraph joins (the phone's Paragrapher rule read off the live boundary) ──

    func testAPauseAfterAFinishedSentenceJoinsTheNextChunkAsAParagraph() {
        XCTAssertEqual(LiveCaptionEngine.chunkJoin(afterChunk: "That was the idea.", trigger: .pause),
                       "\n\n")
        XCTAssertEqual(LiveCaptionEngine.chunkJoin(afterChunk: "Was it real?", trigger: .pause),
                       "\n\n")
    }

    func testAMidSentencePauseChunkJoinsWithASpace() {
        XCTAssertEqual(LiveCaptionEngine.chunkJoin(afterChunk: "and then I went to", trigger: .pause),
                       " ", "no finished sentence — the thought continues on the same line")
    }

    func testCeilingAndCostRotatesNeverParagraph() {
        XCTAssertEqual(LiveCaptionEngine.chunkJoin(afterChunk: "That was the idea.", trigger: .ceiling),
                       " ", "the person kept talking — the clock is not a speech boundary")
        XCTAssertEqual(LiveCaptionEngine.chunkJoin(afterChunk: "That was the idea.", trigger: .cost),
                       " ")
    }

    // ── the Mac's tighter poll floor (settle latency = polls, so the floor is the feel) ──

    func testTheMacPollFloorPacesFasterOnlyWhenAsked() {
        XCTAssertEqual(LiveCaptionEngine.pollDelay(afterSnapshotCost: 0.1, thermal: .nominal), 0.6,
            "the phone's tuned default floor stands untouched")
        XCTAssertEqual(LiveCaptionEngine.pollDelay(afterSnapshotCost: 0.1, thermal: .nominal, floor: 0.4), 0.4)
        XCTAssertEqual(LiveCaptionEngine.pollDelay(afterSnapshotCost: 2.0, thermal: .nominal, floor: 0.4), 3.0,
            "cost-based pacing still dominates the floor when snapshots are dear")
    }

    // ── the tuning constants carry their rationale ──

    func testStabilityConstantsStayInTheResearchedBand() {
        XCTAssertEqual(LiveCaptionEngine.stablePollsToSettle, 2,
            "LocalAgreement-2: one poll is a decode, two is a confirmation (IWSLT2022)")
        XCTAssertGreaterThanOrEqual(LiveCaptionEngine.minPauseWindow, 1.0)
    }
}
