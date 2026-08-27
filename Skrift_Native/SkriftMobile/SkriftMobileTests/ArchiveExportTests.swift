import XCTest
@testable import SkriftMobile

/// The ARCHIVE export profile, proven END TO END on real files in a temp folder — the shape
/// of an entry is derived data, and derived data that is only reasoned about is derived data
/// nobody has checked (the ePub-alignment lesson, 2026-07-23).
///
/// What an archive entry must be, from the portfolio brief:
///
///     _ideas/2026-08/
///       2026-08-26-142312.md      frontmatter + body
///       2026-08-26-142312.jpg     BESIDE the note, same basename
///       2026-08-26-142312.m4a
///
/// Flat, timestamp-named, media beside the note, and no `![[wiki embed]]` anywhere — a
/// vault-relative embed is precisely what stops a note being readable outside its vault.
@MainActor
final class ArchiveExportTests: XCTestCase {

    private var sandbox: URL!
    private var archiveRoot: URL!

    override func setUpWithError() throws {
        sandbox = FileManager.default.temporaryDirectory
            .appendingPathComponent("skrift-archive-\(UUID().uuidString)")
        archiveRoot = sandbox.appendingPathComponent("portfolio")
        try FileManager.default.createDirectory(at: archiveRoot, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: sandbox) }

    /// 26 Aug 2026, 14:23:12 local — the brief's own example timestamp.
    private func captureDate() -> Date {
        var c = DateComponents()
        c.year = 2026; c.month = 8; c.day = 26; c.hour = 14; c.minute = 23; c.second = 12
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        return cal.date(from: c)!
    }

    private func publisher(ledger: ExportLedger) -> ObsidianPublisher {
        ObsidianPublisher(
            vaultProvider: { self.sandbox.appendingPathComponent("vault") },
            archiveFolderProvider: { d in
                d.archiveFolder.map { self.archiveRoot.appendingPathComponent($0, isDirectory: true) }
            },
            archiveScopeRoot: { self.archiveRoot },
            manageScope: false,
            author: "Tiuri Hartog",
            peopleProvider: { [] },
            enhancementProvider: { id in
                MemoEnhancement(memoID: id, copyedit: "A bench made of an oak slab.",
                                title: "The bench outside Café Garrett",
                                summary: "A bench worth copying.")
            },
            ledgerOverride: ledger)
    }

    private func ideaMemo() -> Memo {
        let m = Memo(audioFilename: "memo.m4a", recordedAt: captureDate(),
                     transcript: "A bench made of an oak slab.", significance: 0.5)
        m.destination = .idea
        return m
    }

    // MARK: - The shape of an entry

    func testArchiveEntryIsFlatAndTimestampNamed() throws {
        let ledger = ExportLedger(fileURL: sandbox.appendingPathComponent("l.json"))
        let memo = ideaMemo()

        let outcome = try publisher(ledger: ledger).publish(memo)
        guard case .written(let rel) = outcome else {
            return XCTFail("expected a write, got \(outcome)")
        }

        XCTAssertEqual(rel, "2026-08/2026-08-26-142312.md",
                       "month folder, then a timestamp name — no title, no Skrift/ home")
        let file = archiveRoot.appendingPathComponent("_ideas").appendingPathComponent(rel)
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path), file.path)

        // The Obsidian house — Skrift/, Images/, Recordings/ — must NOT appear in the archive.
        for unwanted in ["Skrift", "_ideas/Skrift", "_ideas/Images", "_ideas/Recordings"] {
            XCTAssertFalse(
                FileManager.default.fileExists(
                    atPath: archiveRoot.appendingPathComponent(unwanted).path),
                "the archive is not a vault — found \(unwanted)")
        }
    }

    func testArchiveNoteCarriesNoWikiEmbedAndNoSensorFrontmatter() throws {
        let ledger = ExportLedger(fileURL: sandbox.appendingPathComponent("l.json"))
        let memo = ideaMemo()
        _ = try publisher(ledger: ledger).publish(memo)

        let file = archiveRoot.appendingPathComponent("_ideas/2026-08/2026-08-26-142312.md")
        let text = try String(contentsOf: file, encoding: .utf8)

        XCTAssertFalse(text.contains("![["), "a vault-relative embed does not travel")
        for key in ["weather:", "pressure:", "dayPeriod:", "daylight:", "steps:", "significance:"] {
            XCTAssertFalse(text.contains(key), "\(key) is personal-notes furniture")
        }
        // …and the keys an archive entry DOES need, including the stamp that stops a filed
        // note from being written again.
        for key in ["title:", "date:", "author:", "source:", "summary:", "tags:",
                    VaultStamp.idKey] {
            XCTAssertTrue(text.contains(key), "missing \(key)")
        }
        // `type:` survives the file being MOVED, which the folder does not — `_inbox/` exists
        // to be filed out of, and a note in an item folder has no path left to say what it is.
        XCTAssertTrue(text.contains("type: idea"), "the destination must outlive its folder")
    }

    /// …and a vault note gets no `type:`. `personal` is the default and thousands of existing
    /// notes do not need a key repeating it.
    func testPersonalNoteHasNoTypeKey() throws {
        let vault = sandbox.appendingPathComponent("vault")
        try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)
        let ledger = ExportLedger(fileURL: sandbox.appendingPathComponent("l3.json"))
        let memo = ideaMemo()
        memo.destination = .personal
        memo.title = "A vault note"
        _ = try publisher(ledger: ledger).publish(memo)

        let text = try String(contentsOf: vault.appendingPathComponent("Skrift/A vault note.md"),
                              encoding: .utf8)
        XCTAssertFalse(text.contains("type:"))
        XCTAssertTrue(text.contains("location:"), "location stays in BOTH profiles")
    }

    /// The vault profile must be untouched by all of this: same home folder, same title-based
    /// name, same subfolders. Destinations changed nothing for a Personal note.
    func testPersonalNoteStillWritesTheObsidianLayout() throws {
        let vault = sandbox.appendingPathComponent("vault")
        try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)
        let ledger = ExportLedger(fileURL: sandbox.appendingPathComponent("l2.json"))

        let memo = ideaMemo()
        memo.destination = .personal
        // The vault name comes from the NOTE's own title (`MemoExporter.exportTitle` —
        // phone-set title, else the transcript's first line), not from the model's suggested
        // one. Set it explicitly so this asserts the naming RULE rather than that fallback.
        memo.title = "The bench outside Café Garrett"

        let outcome = try publisher(ledger: ledger).publish(memo)
        guard case .written(let rel) = outcome else {
            return XCTFail("expected a write, got \(outcome)")
        }
        XCTAssertEqual(rel, "The bench outside Café Garrett.md",
                       "named by title, at the root of the Skrift home — unchanged")
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: vault.appendingPathComponent("Skrift").appendingPathComponent(rel).path))
    }

    // MARK: - Body links

    func testArchiveKeepsPeopleLinksAndPlainifiesEverythingElse() {
        let jack = Person(canonical: "[[Jack]]", aliases: [], short: nil,
                          lastModifiedAt: "2026-01-01T00:00:00Z")
        let body = "Saw [[Jack]] at [[Hotel Du Vin]] and it gave me an idea."

        let kept = Compiler.plainifyNonPeopleLinks(in: body, knownPeople: [jack])
        XCTAssertEqual(kept, "Saw [[Jack]] at Hotel Du Vin and it gave me an idea.",
                       "credit the person, drop the place — Tuur's call, 2026-08-26")
    }

    func testPlainifyLeavesImageEmbedsAlone() {
        let body = "![[shot.jpg]] and [[Somewhere]]"
        XCTAssertEqual(Compiler.plainifyNonPeopleLinks(in: body, knownPeople: []),
                       "![[shot.jpg]] and Somewhere",
                       "an embed is not a link")
    }

    func testPlainifyKeepsTheSpokenFormOfAnAliasLink() {
        XCTAssertEqual(
            Compiler.plainifyNonPeopleLinks(in: "at [[Hotel Du Vin|the hotel]] again", knownPeople: []),
            "at the hotel again",
            "the reader saw the spoken form — that is the text that stays")
    }
}
