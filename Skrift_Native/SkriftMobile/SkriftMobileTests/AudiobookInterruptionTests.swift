import XCTest
@testable import SkriftMobile

/// The audiobook half of the 2026-07-26 audio-session round. Tuur's report:
/// "I was listening to a song on Deezer… I started playing a book. And twice…
/// midway through it stopped and then the song started playing again."
///
/// Cause: the interruption observer acted on `.began` (pause) but did nothing
/// on `.ended`, so any transient interruption paused the book permanently
/// while Deezer — which honours `.shouldResume` — took the route back. These
/// pin the resume contract and the end-of-book guard that could produce the
/// same symptom from bad metadata.
final class AudiobookInterruptionTests: XCTestCase {

    // MARK: - Interruption resume contract

    func testResumesOurOwnInterruptedPause() {
        XCTAssertTrue(AudiobookSession.shouldResumeAfterInterruption(
            pausedByInterruption: true, shouldResumeHint: true, recordingActive: false),
            "the exact case in the report: we paused, system says resume → resume")
    }

    func testNeverResumesAPauseTheUserMade() {
        // The latch is what separates "we stopped it" from "you stopped it".
        // Without this a user-paused book springs to life whenever any
        // unrelated interruption ends.
        XCTAssertFalse(AudiobookSession.shouldResumeAfterInterruption(
            pausedByInterruption: false, shouldResumeHint: true, recordingActive: false))
    }

    func testStaysPausedWithoutTheSystemsResumeHint() {
        // No hint = whoever interrupted still owns the route; resuming would
        // fight an app the user is now actively using.
        XCTAssertFalse(AudiobookSession.shouldResumeAfterInterruption(
            pausedByInterruption: true, shouldResumeHint: false, recordingActive: false))
    }

    func testNeverResumesOverALiveRecording() {
        // Session priority (2026-06-12 device finding): a live memo outranks
        // playback — the book must not grab the mic's route back.
        XCTAssertFalse(AudiobookSession.shouldResumeAfterInterruption(
            pausedByInterruption: true, shouldResumeHint: true, recordingActive: true))
    }

    // MARK: - End of book vs bad metadata

    func testFinalFileOfAMultiFileBook() {
        XCTAssertTrue(AudiobookSession.isFinalFile(index: 2, fileCount: 3))
    }

    func testEarlierFilesAreNotTheEndOfTheBook() {
        // A book whose stored duration under-reports its real length used to
        // trip the end-of-book pause HERE — mid-listen, reading exactly like
        // "the book just stopped".
        XCTAssertFalse(AudiobookSession.isFinalFile(index: 0, fileCount: 3))
        XCTAssertFalse(AudiobookSession.isFinalFile(index: 1, fileCount: 3))
    }

    func testSingleFileBookIsAlwaysItsOwnFinalFile() {
        XCTAssertTrue(AudiobookSession.isFinalFile(index: 0, fileCount: 1))
        // Degenerate metadata (no files listed) must not disable the guard.
        XCTAssertTrue(AudiobookSession.isFinalFile(index: 0, fileCount: 0))
    }
}
