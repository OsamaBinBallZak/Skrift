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
}
