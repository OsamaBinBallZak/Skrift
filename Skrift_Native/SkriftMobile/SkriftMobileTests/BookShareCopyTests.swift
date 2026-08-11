import XCTest
@testable import SkriftMobile

/// The share/import sheets' wording. Both sheets say the same two things — what
/// this book is, and what will actually be sent — so the strings live as pure
/// functions and are asserted here rather than eyeballed in two places.
final class BookShareCopyTests: XCTestCase {

    /// Length comes from `BookTextDisplay.durationText`, the app's one duration
    /// style ("1 h 00"), rather than the mock's "1h 00m" — a second formatter for
    /// one sheet would just be a convention that drifts.
    func testSubtitleJoinsAuthorAndLength() {
        XCTAssertEqual(BookShareCopy.subtitle(author: "Homer", duration: 3600), "Homer · 1 h 00")
    }

    /// An import from a bare audio folder can land without an author; the sheet
    /// should read "1 h 00", never " · 1 h 00".
    func testSubtitleDropsAnEmptyAuthor() {
        XCTAssertEqual(BookShareCopy.subtitle(author: "", duration: 3600), "1 h 00")
    }

    /// The two states of "share what I have" — the only difference the sheet ever
    /// shows. The transcript and alignment ride along unmentioned: plumbing that
    /// saves the recipient hours of transcription, not a thing to decide about.
    func testContentsNamesTheBookTextOnlyWhenThereIsOne() {
        XCTAssertTrue(BookShareCopy.contents(hasText: true, bytes: 797_000_000)
            .hasPrefix("Audio + book text · "))
        XCTAssertTrue(BookShareCopy.contents(hasText: false, bytes: 164_000_000)
            .hasPrefix("Audio · "))
    }

    func testContentsCarriesTheSize() {
        let line = BookShareCopy.contents(hasText: false, bytes: 164_000_000)
        XCTAssertTrue(line.contains("MB"), "Got \(line) — the size is the whole point of the line.")
    }

    /// "486 of 797 MB" — one unit, at the end, so the two numbers read as a pair.
    func testPackagingProgressStatesBothNumbersWithOneUnit() {
        let line = BookShareCopy.packagingProgress(written: 486_000_000, total: 797_000_000)
        XCTAssertTrue(line.contains(" of "), "Got \(line)")
        XCTAssertEqual(line.components(separatedBy: "MB").count - 1, 1,
                       "Only the total carries the unit. Got \(line)")
    }

    func testZeroProgressStillReadsAsAPair() {
        let line = BookShareCopy.packagingProgress(written: 0, total: 797_000_000)
        XCTAssertTrue(line.contains(" of "), "Got \(line)")
    }
}
