import XCTest
import Foundation

/// `PipelineFile.durationSeconds` — the stored `duration` value has TWO live shapes and
/// the reader used to accept only one, so every CloudKit-synced note reported 0.
final class DurationMetadataTests: XCTestCase {

    private func file(duration: Any?) -> PipelineFile {
        let pf = PipelineFile(id: "d", filename: "m.m4a", sourceType: .audio, uploadedAt: Date())
        if let duration {
            pf.audioMetadataJSON = try? JSONSerialization.data(withJSONObject: ["duration": duration])
        }
        return pf
    }

    /// THE BUG: `MemoCloudIngest.metadataJSON` writes `memo.duration`, a TimeInterval.
    func testNumericSecondsAreRead() {
        XCTAssertEqual(file(duration: 134.0).durationSeconds, 134, accuracy: 0.001)
        XCTAssertEqual(file(duration: 96).durationSeconds, 96, accuracy: 0.001, "Int bridges too")
    }

    /// The HTTP-era uploads and every demo/snapshot seed write this shape — it kept
    /// working throughout, which is why the numeric hole stayed invisible in renders.
    func testHMSStringsStillWork() {
        XCTAssertEqual(file(duration: "00:02:14").durationSeconds, 134, accuracy: 0.001)
        XCTAssertEqual(file(duration: "02:14").durationSeconds, 134, accuracy: 0.001)
        XCTAssertEqual(file(duration: "134").durationSeconds, 134, accuracy: 0.001)
        XCTAssertEqual(file(duration: "13:24:07").durationSeconds, 48247, accuracy: 0.001)
    }

    func testMissingOrNonsenseIsZero() {
        XCTAssertEqual(file(duration: nil).durationSeconds, 0)
        XCTAssertEqual(file(duration: "").durationSeconds, 0)
        XCTAssertEqual(file(duration: "not a duration").durationSeconds, 0)
        XCTAssertEqual(file(duration: -5).durationSeconds, 0, "a negative duration is no duration")
        XCTAssertEqual(PipelineFile.durationSeconds(fromMetadataValue: ["nested": 1]), 0)
    }

    /// A long capture must survive the read intact — the sidebar formats it with hours
    /// (`SkriftFormat.duration(seconds:)`, which lives in `Features/` and so is outside
    /// this host-less bundle; its output is checked by the `-snapshot-shell` render).
    func testLongCaptureKeepsItsHours() {
        XCTAssertEqual(file(duration: 48247.0).durationSeconds, 48247, accuracy: 0.001)
    }
}
