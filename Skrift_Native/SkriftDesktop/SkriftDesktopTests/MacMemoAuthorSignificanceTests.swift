import XCTest
import SwiftData

/// The significance floor in `MacMemoAuthor` — right for an import, wrong for a recording.
final class MacMemoAuthorSignificanceTests: XCTestCase {

    private func ctx() throws -> ModelContext {
        let c = try ModelContainer(for: Memo.self, MemoAsset.self,
                                   configurations: ModelConfiguration(isStoredInMemoryOnly: true,
                                                                      cloudKitDatabase: .none))
        return ModelContext(c)
    }

    /// An IMPORT still floors: adding a file to the Mac is a request to process it, and an
    /// unrated memo the Mac silently processes would lie on the phone's flag-to-process UI.
    func testImportFloorsAnUnratedFileToAMinimalRating() throws {
        let c = try ctx()
        let pf = PipelineFile(id: UUID().uuidString, filename: "a.m4a", path: "", size: 1, sourceType: .audio)
        let memo = try MacMemoAuthor.author(for: pf, audioURL: nil, into: c)
        XCTAssertEqual(memo?.significance, 0.1)
    }

    /// A RECORDING does NOT. Capturing a thought is not judging it — under the unrated model
    /// the rating is consent, so a Mac take must arrive unrated exactly like a phone one.
    /// (Tuur, 2026-07-28, on the first real Mac recording: "it shouldn't be. Because it's an
    /// unrated note.")
    func testRecordingStaysUnrated() throws {
        let c = try ctx()
        let pf = PipelineFile(id: UUID().uuidString, filename: "memo_x.m4a", path: "", size: 1, sourceType: .audio)
        let memo = try MacMemoAuthor.author(for: pf, audioURL: nil, into: c, floorSignificance: false)
        XCTAssertEqual(memo?.significance, 0, "a recording is unrated until it's judged")
    }

    /// An EXPLICIT rating survives either way — the flag only governs the floor.
    func testAnExplicitRatingIsNeverOverwritten() throws {
        let c = try ctx()
        for floor in [true, false] {
            let pf = PipelineFile(id: UUID().uuidString, filename: "b.m4a", path: "", size: 1, sourceType: .audio)
            pf.significance = 0.7
            let memo = try MacMemoAuthor.author(for: pf, audioURL: nil, into: c, floorSignificance: floor)
            XCTAssertEqual(memo?.significance, 0.7)
        }
    }
}
