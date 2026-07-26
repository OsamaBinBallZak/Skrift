import XCTest

/// `VaultWriter` — the one write engine both apps drive. Everything here runs against
/// a temp directory standing in for the picked vault folder.
final class VaultWriteTests: XCTestCase {

    private var root: URL!
    private var writer: VaultWriter!
    private let id = UUID(uuidString: "7C3F2A1B-0000-4000-8000-000000000001")!
    private let otherID = UUID(uuidString: "AAAAAAAA-0000-4000-8000-000000000002")!

    /// Compiler-shaped markdown — the engine only ever sees Skrift's own output.
    private func md(_ body: String = "The body.", title: String = "A note") -> String {
        "---\ntitle: \"\(title)\"\nlastTouched:\nauthor: Tuur\ntags:\n  - work\n---\n\n\(body)\n"
    }

    override func setUp() {
        super.setUp()
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("vault-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        writer = VaultWriter(root: root,
                             ledger: ExportLedger(fileURL: root.appendingPathComponent(".ledger.json")))
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
        super.tearDown()
    }

    private func export(_ markdown: String, id: UUID, title: String) throws -> VaultWriter.Result? {
        switch writer.assess(id: id, title: title, filenameFallback: "memo.m4a") {
        case .proceed(let rel, _):
            return try writer.commit(markdown: markdown, id: id, relativePath: rel)
        case .refused:
            return nil
        }
    }

    private func read(_ rel: String) -> String? {
        VaultWriter.readCoordinated(root.appendingPathComponent(rel))
    }

    // ── the happy path ──

    func testFirstExportCreatesAStampedFileAtThePlainStem() throws {
        let r = try XCTUnwrap(export(md(), id: id, title: "A note"))
        XCTAssertEqual(r.outcome, .created(relativePath: "A note.md"))
        let onDisk = try XCTUnwrap(read("A note.md"))
        guard case .untouched(let marks) = VaultStamp.standing(of: onDisk) else {
            return XCTFail("what we write must read back as our own untouched file")
        }
        XCTAssertEqual(marks.id, id)
    }

    func testReexportOfIdenticalContentWritesNothing() throws {
        _ = try export(md(), id: id, title: "A note")
        let before = read("A note.md")
        let r = try XCTUnwrap(export(md(), id: id, title: "A note"))
        XCTAssertEqual(r.outcome, .unchanged(relativePath: "A note.md"))
        XCTAssertEqual(read("A note.md"), before,
                       "not even the timestamp churns — every rewrite is iCloud sync traffic")
    }

    func testChangedContentUpdatesInPlace() throws {
        _ = try export(md("First polish."), id: id, title: "A note")
        let r = try XCTUnwrap(export(md("Better polish."), id: id, title: "A note"))
        XCTAssertEqual(r.outcome, .updated(relativePath: "A note.md"))
        XCTAssertTrue(try XCTUnwrap(read("A note.md")).contains("Better polish."))
    }

    /// A retitle keeps the FILE: the ledger path is sticky, so no `New title.md` twin.
    func testRetitledNoteKeepsItsFile() throws {
        _ = try export(md(title: "Old title"), id: id, title: "Old title")
        let r = try XCTUnwrap(export(md(title: "New title"), id: id, title: "New title"))
        XCTAssertEqual(r.outcome, .updated(relativePath: "Old title.md"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("New title.md").path))
    }

    // ── the guards ──

    func testAVaultEditBacksTheWriterOff() throws {
        _ = try export(md(), id: id, title: "A note")
        let edited = try XCTUnwrap(read("A note.md")) + "\nA thought I added in Obsidian.\n"
        try VaultWriter.writeAtomic(Data(edited.utf8), to: root.appendingPathComponent("A note.md"))

        guard case .refused(.backedOffUserEdited(let rel)) =
                writer.assess(id: id, title: "A note", filenameFallback: "memo.m4a") else {
            return XCTFail("an edited file must never be overwritten")
        }
        XCTAssertEqual(rel, "A note.md")
        XCTAssertEqual(read("A note.md"), edited, "and the edit survives untouched")
    }

    /// A hand-authored note whose title collides is NEVER overwritten — the new note
    /// takes the deterministic id-suffixed name instead.
    func testForeignFileAtTheStemIsNeverTouched() throws {
        let theirs = "# Weekly review\n\nMy own note.\n"
        try VaultWriter.writeAtomic(Data(theirs.utf8), to: root.appendingPathComponent("Weekly review.md"))

        let r = try XCTUnwrap(export(md(title: "Weekly review"), id: id, title: "Weekly review"))
        XCTAssertEqual(r.outcome, .created(relativePath: "Weekly review 7C3F2A1B.md"))
        XCTAssertEqual(read("Weekly review.md"), theirs)
    }

    /// A PRE-STAMP Skrift export (the empty `lastTouched:` tell, no id) blocks — and
    /// crucially does NOT sidestep to a suffixed twin, which would duplicate every
    /// legacy note in Tuur's real vault on its first re-export.
    func testLegacyExportBlocksWithoutMintingADuplicate() throws {
        try VaultWriter.writeAtomic(Data(md(title: "A note").utf8), to: root.appendingPathComponent("A note.md"))

        guard case .refused(.blockedLegacy("A note.md")) =
                writer.assess(id: id, title: "A note", filenameFallback: "memo.m4a") else {
            return XCTFail("legacy must block, not dodge")
        }
        let files = try FileManager.default.contentsOfDirectory(atPath: root.path)
        XCTAssertEqual(files.filter { $0.hasSuffix(".md") }, ["A note.md"], "no twin was written")
    }

    /// Two DIFFERENT notes sharing a title coexist: the second deterministically takes
    /// the suffixed name — the same one on every device and every retry.
    func testTwoNotesWithOneTitleCoexistDeterministically() throws {
        _ = try export(md(), id: id, title: "A note")
        let r = try XCTUnwrap(export(md("Other body."), id: otherID, title: "A note"))
        XCTAssertEqual(r.outcome, .created(relativePath: "A note AAAAAAAA.md"))
    }

    /// The inbox doctrine: a note filed out of the folder is NOT re-created. The
    /// engine reports it moved and steps aside (the return path follows it later).
    func testAFiledAwayNoteIsNotRecreated() throws {
        _ = try export(md(), id: id, title: "A note")
        try FileManager.default.removeItem(at: root.appendingPathComponent("A note.md"))

        guard case .refused(.movedAway("A note.md")) =
                writer.assess(id: id, title: "A note", filenameFallback: "memo.m4a") else {
            return XCTFail("a moved note must not respawn in the inbox")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("A note.md").path))
    }

    // ── resilience ──

    /// Safety survives losing the ledger: a fresh install finds its OWN file by stamp
    /// and adopts it instead of writing a twin. (This is also the iPad-meets-the-Mac's-
    /// export case — same id arrives from a device with no ledger.)
    func testFreshLedgerAdoptsItsOwnFileInsteadOfTwinning() throws {
        _ = try export(md(), id: id, title: "A note")
        writer.ledger = ExportLedger(fileURL: root.appendingPathComponent(".ledger2.json"))   // amnesia

        let r = try XCTUnwrap(export(md(), id: id, title: "A note"))
        XCTAssertEqual(r.outcome, .unchanged(relativePath: "A note.md"))
        let files = try FileManager.default.contentsOfDirectory(atPath: root.path)
        XCTAssertEqual(files.filter { $0.hasSuffix(".md") }.count, 1)
    }

    /// …and if the OTHER device's copy was edited in the vault, the ledger-less device
    /// backs off exactly like the one that wrote it.
    func testFreshLedgerStillRespectsAVaultEdit() throws {
        _ = try export(md(), id: id, title: "A note")
        let edited = try XCTUnwrap(read("A note.md")) + "\nEdited in Obsidian.\n"
        try VaultWriter.writeAtomic(Data(edited.utf8), to: root.appendingPathComponent("A note.md"))
        writer.ledger = ExportLedger(fileURL: root.appendingPathComponent(".ledger2.json"))

        guard case .refused(.backedOffUserEdited("A note.md")) =
                writer.assess(id: id, title: "A note", filenameFallback: "memo.m4a") else {
            return XCTFail("the stamp, not the ledger, is the safety")
        }
    }

    // ── assets ──

    func testAssetsLandInSubfoldersInsideThePickedFolder() throws {
        guard case .proceed(let rel, _) = writer.assess(id: id, title: "A note", filenameFallback: "memo.m4a") else {
            return XCTFail()
        }
        let r = try writer.commit(markdown: md(), id: id, relativePath: rel,
                                  attachments: [VaultAsset(name: "A note_001.jpg", source: .data(Data([0xFF])))],
                                  audio: VaultAsset(name: "A note.m4a", source: .data(Data([0x00]))))
        XCTAssertEqual(r.attachmentsWritten, 1)
        XCTAssertEqual(r.audioURL, root.appendingPathComponent("Voice Memos/A note.m4a"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent("Attachments/A note_001.jpg").path))
    }

    func testUnchangedSkipsAssetWritesToo() throws {
        _ = try export(md(), id: id, title: "A note")
        guard case .proceed(let rel, _) = writer.assess(id: id, title: "A note", filenameFallback: "memo.m4a") else {
            return XCTFail()
        }
        let r = try writer.commit(markdown: md(), id: id, relativePath: rel,
                                  audio: VaultAsset(name: "A note.m4a", source: .data(Data([0x00]))))
        XCTAssertEqual(r.outcome, .unchanged(relativePath: rel))
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("Voice Memos/A note.m4a").path),
                       "no churn on an unchanged note — not even assets")
    }

    // ── naming ──

    func testStemSanitisesObsidianForbiddenCharacters() {
        XCTAssertEqual(VaultName.stem(title: "Title: Sub/part?", filename: "m.m4a"), "Title Sub-part")
        XCTAssertEqual(VaultName.stem(title: nil, filename: "memo_abc.m4a"), "memo_abc")
        XCTAssertEqual(VaultName.stem(title: "###", filename: "m.m4a"), "note")
    }
}
