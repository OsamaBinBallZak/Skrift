import XCTest

/// `VaultLayout.home(forPicked:)` — which folder a pick actually resolves to.
///
/// The stakes are asymmetric: resolving too eagerly means Skrift writes into a folder that
/// isn't its own, and resolving too shyly means `0 Inbox/Skrift/Skrift/`, the nesting the
/// 2026-07-26 doctrine exists to prevent. Both of Tuur's habits — pointing at `0 Inbox` and
/// pointing at `0 Inbox/Skrift` — have to land in the same place.
final class VaultLayoutTests: XCTestCase {

    private var tmp: URL!

    override func setUpWithError() throws {
        tmp = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("vaultlayout-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tmp)
    }

    private func mkdir(_ name: String) throws -> URL {
        let u = tmp.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    /// Point at a plain folder → Skrift makes its own house inside it.
    func testPlainFolderGetsASkriftHome() throws {
        let inbox = try mkdir("0 Inbox")
        XCTAssertEqual(VaultLayout.home(forPicked: inbox).path,
                       inbox.appendingPathComponent("Skrift").path)
    }

    /// Point at `0 Inbox` when `0 Inbox/Skrift` already exists → adopt it, don't make a second.
    func testExistingSkriftFolderIsAdopted() throws {
        let inbox = try mkdir("0 Inbox")
        let existing = try mkdir("0 Inbox/Skrift")
        XCTAssertEqual(VaultLayout.home(forPicked: inbox).path, existing.path)
    }

    /// Point straight AT the Skrift folder → use it as-is. This is the nesting guard, and it
    /// must hold for a folder with nothing in it at all.
    func testPickingTheSkriftFolderItselfDoesNotNest() throws {
        let skrift = try mkdir("0 Inbox/Skrift")
        XCTAssertEqual(VaultLayout.home(forPicked: skrift).path, skrift.path)
    }

    /// A folder holding OUR notes is ours whatever it's called — someone renamed it, or it
    /// predates the convention.
    func testFolderHoldingStampedNotesIsAdoptedByAnyName() throws {
        let odd = try mkdir("Notes from the Mac")
        try "---\n\(VaultStamp.idKey): \(UUID().uuidString)\n---\n\nbody\n"
            .write(to: odd.appendingPathComponent("A note.md"), atomically: true, encoding: .utf8)
        XCTAssertEqual(VaultLayout.home(forPicked: odd).path, odd.path)
    }

    /// A folder of SOMEONE ELSE'S markdown is not ours. Adopting it would scatter Skrift's
    /// notes through a folder the user curates by hand.
    func testFolderOfForeignMarkdownIsNotAdopted() throws {
        let vault = try mkdir("Vault")
        try "# Weekly review\n\nnothing to do with us\n"
            .write(to: vault.appendingPathComponent("Weekly review.md"), atomically: true, encoding: .utf8)
        XCTAssertEqual(VaultLayout.home(forPicked: vault).path,
                       vault.appendingPathComponent("Skrift").path)
    }

    /// Resolving must never CREATE anything — a user opening the picker and cancelling should
    /// leave no trace in the vault.
    func testResolvingCreatesNothing() throws {
        let inbox = try mkdir("0 Inbox")
        _ = VaultLayout.home(forPicked: inbox)
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: inbox.appendingPathComponent("Skrift").path))
    }

    /// Both of Tuur's habits land in exactly the same folder — the promise that lets him
    /// switch the Mac's setting without anything in the vault moving.
    func testBothHabitsResolveToTheSamePlace() throws {
        let inbox = try mkdir("0 Inbox")
        let direct = try mkdir("0 Inbox/Skrift")
        XCTAssertEqual(VaultLayout.home(forPicked: inbox).path,
                       VaultLayout.home(forPicked: direct).path)
    }
}
