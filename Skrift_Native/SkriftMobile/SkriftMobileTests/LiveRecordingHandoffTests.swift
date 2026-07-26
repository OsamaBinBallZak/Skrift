import AVFoundation
import XCTest
@testable import SkriftMobile

/// The Bluetooth mic policy (Tuur decisions 2026-07-26, two device rounds).
/// b115: the ~1 s cold-AirPods start is the A2DP→HFP flip inside
/// engine.start(). b117 killed the mid-recording flip — the OS stops the mic
/// at the START of the route transition (~1.9 s hole mid-speech, ate two
/// counted numbers). Policy now: with Bluetooth around, the whole recording
/// stays on the built-in mic; output stays full-quality A2DP.
final class LiveRecordingHandoffTests: XCTestCase {

    func testAvoidingOptionsExcludeHFPAndKeepA2DP() {
        let opts = LiveRecordingService.recordingCategoryOptions(avoidBluetoothMic: true)
        XCTAssertTrue(opts.contains(.allowBluetoothA2DP), "output must stay on the AirPods")
        XCTAssertFalse(opts.contains(.allowBluetooth), "HFP allowed = the ~1 s flip at engine start")
        XCTAssertTrue(opts.contains(.defaultToSpeaker))
    }

    func testClassicOptionsAllowHFP() {
        let opts = LiveRecordingService.recordingCategoryOptions(avoidBluetoothMic: false)
        XCTAssertTrue(opts.contains(.allowBluetooth))
        XCTAssertTrue(opts.contains(.defaultToSpeaker))
    }

    func testAvoidsBluetoothMicWhenAirPodsAreTheOutput() {
        XCTAssertTrue(LiveRecordingService.avoidsBluetoothMic(
            currentInputPortType: .builtInMic,
            outputPortTypes: [.bluetoothA2DP],
            availableInputPortTypes: []))
    }

    func testAvoidsBluetoothMicWhenAHeadsetMicIsAvailable() {
        XCTAssertTrue(LiveRecordingService.avoidsBluetoothMic(
            currentInputPortType: .builtInMic,
            outputPortTypes: [.builtInSpeaker],
            availableInputPortTypes: [.bluetoothHFP]))
    }

    func testClassicPathWithoutAnyBluetooth() {
        XCTAssertFalse(LiveRecordingService.avoidsBluetoothMic(
            currentInputPortType: .builtInMic,
            outputPortTypes: [.builtInSpeaker],
            availableInputPortTypes: [.builtInMic]))
    }

    func testNeverYanksALiveHeadsetMicAtStart() {
        // Input already HFP (e.g. mid-call): forcing A2DP-only would flip the
        // route BACKWARDS at start — leave it exactly as before this policy.
        XCTAssertFalse(LiveRecordingService.avoidsBluetoothMic(
            currentInputPortType: .bluetoothHFP,
            outputPortTypes: [.bluetoothHFP],
            availableInputPortTypes: [.bluetoothHFP]))
    }
}
