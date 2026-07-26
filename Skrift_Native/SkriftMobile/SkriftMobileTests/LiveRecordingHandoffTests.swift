import AVFoundation
import XCTest
@testable import SkriftMobile

/// The two-phase Bluetooth handoff policy (Tuur decision 2026-07-26, off the
/// b115 trace: the ~1 s cold-AirPods start is the A2DP→HFP flip inside
/// engine.start()). Phase 1 starts WITHOUT HFP (built-in mic, fast); phase 2
/// re-allows HFP mid-recording and the rebuild machinery swaps the tap.
/// Pure-policy tests — the flip itself is hardware and belongs to the device
/// round.
final class LiveRecordingHandoffTests: XCTestCase {

    func testPhaseOneOptionsExcludeHFPAndKeepA2DP() {
        let p1 = LiveRecordingService.recordingCategoryOptions(deferHFP: true)
        XCTAssertTrue(p1.contains(.allowBluetoothA2DP), "output must stay on the AirPods")
        XCTAssertFalse(p1.contains(.allowBluetooth), "HFP allowed at start = the ~1 s flip at start")
        XCTAssertTrue(p1.contains(.defaultToSpeaker))
    }

    func testPhaseTwoOptionsAllowHFP() {
        let p2 = LiveRecordingService.recordingCategoryOptions(deferHFP: false)
        XCTAssertTrue(p2.contains(.allowBluetooth))
        XCTAssertTrue(p2.contains(.defaultToSpeaker))
    }

    func testDeferralWantedWhenAirPodsAreTheOutput() {
        XCTAssertTrue(LiveRecordingService.wantsDeferredHFPFlip(
            currentInputPortType: .builtInMic,
            outputPortTypes: [.bluetoothA2DP],
            availableInputPortTypes: []))
    }

    func testDeferralWantedWhenAHeadsetMicIsAvailable() {
        XCTAssertTrue(LiveRecordingService.wantsDeferredHFPFlip(
            currentInputPortType: .builtInMic,
            outputPortTypes: [.builtInSpeaker],
            availableInputPortTypes: [.bluetoothHFP]))
    }

    func testNoDeferralWithoutAnyBluetooth() {
        XCTAssertFalse(LiveRecordingService.wantsDeferredHFPFlip(
            currentInputPortType: .builtInMic,
            outputPortTypes: [.builtInSpeaker],
            availableInputPortTypes: [.builtInMic]))
    }

    func testNoDeferralWhenAlreadyOnTheHeadsetMic() {
        // Forcing A2DP-only here would flip the route BACKWARDS at start.
        XCTAssertFalse(LiveRecordingService.wantsDeferredHFPFlip(
            currentInputPortType: .bluetoothHFP,
            outputPortTypes: [.bluetoothHFP],
            availableInputPortTypes: [.bluetoothHFP]))
    }
}
