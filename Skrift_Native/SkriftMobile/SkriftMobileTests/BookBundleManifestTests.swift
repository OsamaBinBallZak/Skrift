import XCTest
@testable import SkriftMobile

/// The `.skriftbook` manifest and the rules that decide what a shared book
/// carries. The rule under test is Tuur's, 2026-08-11: send the BOOK, never your
/// relationship to it — every book-side part if it exists, none of the reading
/// state. These are the parts worth asserting without a device; the zip I/O
/// around them is a thin shell verified by actually AirDropping a book.
final class BookBundleManifestTests: XCTestCase {

    private func makeBook(files: [String] = ["part1.m4b"],
                          texts: [String] = [],
                          position: TimeInterval = 0,
                          rate: Double = 1.0) -> Audiobook {
        var book = Audiobook(
            files: files,
            fileDurations: files.map { _ in 3600 },
            title: "The Odyssey",
            author: "Homer",
            duration: Double(files.count) * 3600,
            chapters: [],
            hasCover: true,
            importedAt: Date(timeIntervalSince1970: 1_000_000),
            position: position,
            playbackRate: rate)
        book.epubFilenames = texts.isEmpty ? nil : texts
        book.epubFilename = texts.first
        book.detectedChapters = [AudiobookChapter(title: "Book I", start: 0, duration: 600)]
        book.epubChapters = [AudiobookChapter(title: "Book I", start: 0, duration: 620)]
        book.lastPlayedAt = Date(timeIntervalSince1970: 2_000_000)
        return book
    }

    // MARK: - "Don't share my location — it's a new book for them"

    func testSharingStripsTheReadingState() {
        let shared = makeBook(position: 4_215, rate: 1.75).sanitizedForSharing()
        XCTAssertEqual(shared.position, 0, "Your place in the book is yours.")
        XCTAssertEqual(shared.playbackRate, 1.0, "Your playback speed is a preference, not the book.")
        XCTAssertNil(shared.lastPlayedAt, "When you last opened it says nothing about the book.")
    }

    /// The receiver gets the sidecar FILES and re-derives its own chapter lists,
    /// so shipping the sender's copies would only be a second source to drift.
    func testSharingStripsLocallyDerivedFields() {
        let shared = makeBook(texts: ["odyssey.epub"]).sanitizedForSharing()
        XCTAssertNil(shared.detectedChapters)
        XCTAssertNil(shared.epubChapters)
        XCTAssertNil(shared.epubFilenames)
        XCTAssertNil(shared.epubFilename)
    }

    /// The id is what makes a second import of the same file land on "Already in
    /// your books" rather than duplicating the library entry.
    func testSharingKeepsTheBookIdAndTheBookItself() {
        let book = makeBook()
        let shared = book.sanitizedForSharing()
        XCTAssertEqual(shared.id, book.id)
        XCTAssertEqual(shared.title, "The Odyssey")
        XCTAssertEqual(shared.author, "Homer")
        XCTAssertEqual(shared.files, book.files)
        XCTAssertEqual(shared.duration, book.duration)
    }

    // MARK: - "Share what I have" — present if present, absent if not

    func testCarriesEverythingTheSenderHas() {
        let m = BookBundleRules.manifest(
            for: makeBook(files: ["a.mp3", "b.mp3"], texts: ["odyssey.epub"]),
            hasCover: true,
            textFilenames: ["odyssey.epub"],
            transcriptFilenames: ["transcript_f0.json", "transcript_f1.json"],
            alignmentFilenames: ["alignment_f0.json"])

        XCTAssertEqual(m.audioFilenames, ["a.mp3", "b.mp3"])
        XCTAssertEqual(m.coverFilename, "cover.jpg")
        XCTAssertEqual(m.textFilenames, ["odyssey.epub"])
        XCTAssertEqual(m.transcriptFilenames.count, 2)
        XCTAssertEqual(m.alignmentFilenames, ["alignment_f0.json"])
    }

    /// "If I don't have the transcript, don't share the transcript." A book with
    /// nothing but audio is a valid bundle, not a degraded one.
    func testAudioOnlyBookIsAValidBundle() {
        let m = BookBundleRules.manifest(
            for: makeBook(), hasCover: false,
            textFilenames: [], transcriptFilenames: [], alignmentFilenames: [])

        XCTAssertNil(m.coverFilename)
        XCTAssertTrue(m.textFilenames.isEmpty)
        XCTAssertTrue(m.transcriptFilenames.isEmpty)
        XCTAssertTrue(m.alignmentFilenames.isEmpty)
        XCTAssertTrue(m.isReadable, "Audio alone is a whole book — that's the no-options case.")
        XCTAssertEqual(m.entryPaths, ["manifest.json", "audio/part1.m4b"])
    }

    func testEntryPathsPlaceEveryPartInItsDirectory() {
        let m = BookBundleRules.manifest(
            for: makeBook(files: ["a.mp3"], texts: ["odyssey.epub"]),
            hasCover: true,
            textFilenames: ["odyssey.epub"],
            transcriptFilenames: ["transcript_f0.json"],
            alignmentFilenames: ["alignment_f0.json"])

        XCTAssertEqual(m.entryPaths, [
            "manifest.json",
            "audio/a.mp3",
            "cover.jpg",
            "text/odyssey.epub",
            "derived/transcript_f0.json",
            "derived/alignment_f0.json",
        ])
    }

    // MARK: - Refusing a bundle we can't act on, before anything is unpacked

    func testRefusesAFutureSchema() {
        var m = BookBundleRules.manifest(for: makeBook(), hasCover: false,
                                         textFilenames: [], transcriptFilenames: [],
                                         alignmentFilenames: [])
        m.schema = BookBundleManifest.currentSchema + 1
        XCTAssertFalse(m.isReadable, "A newer Skrift's bundle must be refused, not half-read.")
    }

    func testRefusesAManifestWithNoAudio() {
        var m = BookBundleRules.manifest(for: makeBook(), hasCover: false,
                                         textFilenames: [], transcriptFilenames: [],
                                         alignmentFilenames: [])
        m.audioFilenames = []
        XCTAssertFalse(m.isReadable)
    }

    /// A file list that disagrees with the record is a truncated or edited
    /// archive; better refused than imported as a book with silent holes.
    func testRefusesWhenTheFileListDisagreesWithTheRecord() {
        var m = BookBundleRules.manifest(for: makeBook(files: ["a.mp3", "b.mp3"]),
                                         hasCover: false, textFilenames: [],
                                         transcriptFilenames: [], alignmentFilenames: [])
        m.audioFilenames = ["a.mp3"]
        XCTAssertFalse(m.isReadable)
    }

    // MARK: - Round trip + the receiving side

    func testManifestSurvivesAJSONRoundTrip() throws {
        let original = BookBundleRules.manifest(
            for: makeBook(files: ["a.mp3", "b.mp3"], texts: ["odyssey.epub"]),
            hasCover: true, textFilenames: ["odyssey.epub"],
            transcriptFilenames: ["transcript_f0.json"], alignmentFilenames: ["alignment_f0.json"])

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(BookBundleManifest.self, from: data)

        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.book.id, original.book.id)
        XCTAssertEqual(decoded.schema, BookBundleManifest.currentSchema)
    }

    func testAlreadyImportedIsKeyedOnTheBookId() {
        let m = BookBundleRules.manifest(for: makeBook(), hasCover: false, textFilenames: [],
                                         transcriptFilenames: [], alignmentFilenames: [])
        XCTAssertTrue(BookBundleRules.alreadyImported(m, existing: [UUID(), m.book.id]))
        XCTAssertFalse(BookBundleRules.alreadyImported(m, existing: [UUID()]))
        XCTAssertFalse(BookBundleRules.alreadyImported(m, existing: []))
    }

    /// The imported record is stamped with the RECEIVER's dates and re-pointed at
    /// the text files that just landed; chapters stay nil so the receiving device
    /// derives its own from the sidecars it now owns.
    func testImportedRecordIsStampedAndRepointed() {
        let m = BookBundleRules.manifest(
            for: makeBook(texts: ["odyssey.epub"]), hasCover: true,
            textFilenames: ["odyssey.epub"], transcriptFilenames: [], alignmentFilenames: [])
        let now = Date(timeIntervalSince1970: 9_000_000)

        let landed = BookBundleRules.imported(m, at: now)

        XCTAssertEqual(landed.importedAt, now)
        XCTAssertEqual(landed.modifiedAt, now)
        XCTAssertEqual(landed.epubFilenames, ["odyssey.epub"])
        XCTAssertEqual(landed.epubFilename, "odyssey.epub")
        XCTAssertNil(landed.detectedChapters)
        XCTAssertNil(landed.epubChapters)
        XCTAssertEqual(landed.position, 0, "It arrives as a new book for them.")
    }

    func testImportedAudioOnlyBookHasNoTextFields() {
        let m = BookBundleRules.manifest(for: makeBook(), hasCover: false, textFilenames: [],
                                         transcriptFilenames: [], alignmentFilenames: [])
        let landed = BookBundleRules.imported(m, at: Date(timeIntervalSince1970: 9_000_000))
        XCTAssertNil(landed.epubFilenames)
        XCTAssertNil(landed.epubFilename)
    }
}
