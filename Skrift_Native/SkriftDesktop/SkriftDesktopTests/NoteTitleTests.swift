import XCTest

/// `NoteTitle.clip` — the derived-title cut every display surface shares.
final class NoteTitleTests: XCTestCase {

    func testShortTitlePassesThroughUntouched() {
        XCTAssertEqual(NoteTitle.clip("First line here."), "First line here.")
    }

    func testExactlyAtTheLimitIsNotClipped() {
        let line = String(repeating: "a", count: NoteTitle.limit)
        XCTAssertEqual(NoteTitle.clip(line), line)
    }

    /// The bug this exists for — Tuur's own note, verbatim. A bare `prefix(80)` cut
    /// it to "…the record button, it s", which reads as a rendering fault rather than
    /// a truncation. The whole word "it" survives; the orphaned "s" doesn't.
    func testClipsOnAWordBoundaryAndMarksTheCut() {
        let line = "Yo claude. I got a problem. Well first off, once I click the record button, it says starting"
        let out = NoteTitle.clip(line)
        XCTAssertTrue(out.hasSuffix("…"), "a cut title must say it was cut")
        XCTAssertEqual(out, "Yo claude. I got a problem. Well first off, once I click the record button, it…")
        XCTAssertFalse(out.dropLast().hasSuffix(" "), "no space stranded before the ellipsis")
        XCTAssertLessThanOrEqual(out.count, NoteTitle.limit + 1, "the ellipsis is the only overshoot")
    }

    /// One word longer than the whole limit has no boundary to break on — cut it
    /// hard rather than return an empty title.
    func testSingleOverlongWordStillYieldsATitle() {
        let out = NoteTitle.clip(String(repeating: "x", count: 200))
        XCTAssertEqual(out, String(repeating: "x", count: NoteTitle.limit) + "…")
    }
}
