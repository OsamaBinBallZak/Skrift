import XCTest
@testable import SkriftMobile

/// The whole-book transcribe's power policy — the ONE rule that decides whether the
/// job auto-pauses. Pulled out as a pure function precisely so it can be asserted
/// without a device: the behaviour it encodes (keep going in Low Power Mode, stop
/// under 20% on battery) is otherwise only observable by draining a real phone.
final class BookTranscribePowerPolicyTests: XCTestCase {

    // MARK: - The 2026-07-30 change: Low Power Mode must not stop a transcribe

    /// The regression guard. LPM is absent from the rule entirely — the policy reads
    /// only plug state + charge — so a job that would run at 55% keeps running no
    /// matter what the power mode is. Written as the pair it replaces: before this
    /// change, "on battery + LPM" pauses; now it's identical to plain "on battery".
    func testLowPowerModeIsNotPartOfThePolicy() {
        XCTAssertFalse(BookTranscriptionJob.shouldConserve(pluggedIn: false, batteryLevel: 0.55),
                       "On battery at 55% the job must run — Low Power Mode is not a stop signal.")
    }

    // MARK: - What still protects the phone

    func testLowChargeOnBatteryPauses() {
        XCTAssertTrue(BookTranscriptionJob.shouldConserve(pluggedIn: false, batteryLevel: 0.05))
        XCTAssertTrue(BookTranscriptionJob.shouldConserve(pluggedIn: false, batteryLevel: 0.19))
    }

    func testPluggedInNeverConserves() {
        // Charging is the "go ahead and work" signal — even at 1%.
        XCTAssertFalse(BookTranscriptionJob.shouldConserve(pluggedIn: true, batteryLevel: 0.01))
        XCTAssertFalse(BookTranscriptionJob.shouldConserve(pluggedIn: true, batteryLevel: 0.50))
    }

    /// The threshold is a floor, not a window: exactly 20% still runs, a hair under
    /// pauses. Asserted against the constant so moving it can't silently pass.
    func testThresholdBoundary() {
        let floor = BookTranscriptionJob.lowBatteryPauseLevel
        XCTAssertFalse(BookTranscriptionJob.shouldConserve(pluggedIn: false, batteryLevel: floor))
        XCTAssertTrue(BookTranscriptionJob.shouldConserve(pluggedIn: false, batteryLevel: floor - 0.01))
    }

    /// UIKit reports -1 when battery monitoring is off or the level is unknown. That
    /// must not read as "flat" — an unknown level keeps the job alive rather than
    /// silently parking every transcribe on a device that never reports a level.
    func testUnknownBatteryLevelKeepsRunning() {
        XCTAssertFalse(BookTranscriptionJob.shouldConserve(pluggedIn: false, batteryLevel: -1))
    }
}
