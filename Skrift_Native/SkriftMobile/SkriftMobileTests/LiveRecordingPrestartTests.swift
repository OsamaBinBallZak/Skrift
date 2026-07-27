import XCTest
@testable import SkriftMobile

/// The prestart contract: the record button parks a starting service in
/// `LiveRecordingService.prestarted`; the recorder claims it exactly once in
/// onAppear; every other flow (append, quote ramble, Siri, mock) claims nil
/// and uses its own instance. Mock services keep the whole flow off the live
/// audio session, so these run on the sim.
@MainActor
final class LiveRecordingPrestartTests: XCTestCase {

    override func tearDown() {
        LiveRecordingService.prestarted = nil
        super.tearDown()
    }

    func testClaimHandsOverTheParkedServiceExactlyOnce() {
        let svc = LiveRecordingService(mock: true)
        LiveRecordingService.prestarted = svc
        XCTAssertTrue(LiveRecordingService.claimPrestarted() === svc,
                      "the recorder must receive the exact parked instance")
        XCTAssertNil(LiveRecordingService.claimPrestarted(),
                     "a second claim (a re-presented recorder) must get nothing")
    }

    func testClaimIsNilWhenNothingWasPrestarted() {
        // The append / quote-ramble / Siri flows never prestart — their
        // RecordView must fall through to its own fresh service.
        XCTAssertNil(LiveRecordingService.claimPrestarted())
    }

    func testStartFastBringsAMockServiceLive() async throws {
        let svc = LiveRecordingService(mock: true)
        svc.startFast(tappedAt: Date())
        var waited = 0
        while !svc.isRecording, waited < 200 {
            try await Task.sleep(for: .milliseconds(10))
            waited += 1
        }
        XCTAssertTrue(svc.isRecording, "the fast path must reach isRecording on its own")
        svc.cancel()
        XCTAssertFalse(svc.isRecording)
    }

    func testStartFastIsIdempotentWhileInFlight() async throws {
        let svc = LiveRecordingService(mock: true)
        svc.startFast(tappedAt: Date())
        svc.startFast(tappedAt: Date())   // second driver must no-op, not race
        var waited = 0
        while !svc.isRecording, waited < 200 {
            try await Task.sleep(for: .milliseconds(10))
            waited += 1
        }
        XCTAssertTrue(svc.isRecording)
        svc.cancel()
    }

    // b115 device trace: the orphaned prestart became a SECOND concurrent
    // recording alongside the user's live one. These pin the contract that a
    // driver on one instance refuses while another instance is capturing.

    func testStartFastRefusesWhileAnotherInstanceRecords() async throws {
        let live = LiveRecordingService(mock: true)
        try live.start()
        XCTAssertTrue(LiveRecordingService.isRecordingActive)

        let intruder = LiveRecordingService(mock: true)
        intruder.startFast(tappedAt: Date())
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertFalse(intruder.isRecording,
                       "a second concurrent recording must never start")
        live.cancel()
    }

    func testRetryLadderRefusesWhileAnotherInstanceRecords() async throws {
        let live = LiveRecordingService(mock: true)
        try live.start()

        let intruder = LiveRecordingService(mock: true)
        intruder.startRetrying()
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertFalse(intruder.isRecording,
                       "the ladder must bail, not queue up a second recording")
        live.cancel()
    }
}
