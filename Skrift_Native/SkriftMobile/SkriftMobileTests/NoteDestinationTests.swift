import XCTest
@testable import SkriftMobile

/// `NoteDestination` + the reserved-word guard — the one-of-four rule in code.
///
/// The rule under test is a PRIVACY rule, not a tidiness rule (Tuur, 2026-08-26): his own
/// thoughts must never be read by AI, his ideas and inspirations deliberately are. So a note
/// carries exactly one destination, an unreadable one degrades to the PRIVATE side, and the
/// four words can't be smuggled in as tags.
final class NoteDestinationTests: XCTestCase {

    // MARK: - The four

    func testPersonalIsTheDefaultAndTheOnlyPrivateOne() {
        XCTAssertEqual(Memo(title: "T").destination, .personal,
                       "an existing memo, and every new one, means today's behaviour")
        XCTAssertFalse(NoteDestination.personal.isArchive)
        for d in [NoteDestination.made, .idea, .inspiration] {
            XCTAssertTrue(d.isArchive, "\(d.label) leaves for a repo an AI reads")
        }
    }

    func testArchiveFoldersMatchTheSpec() {
        XCTAssertNil(NoteDestination.personal.archiveFolder, "personal uses the vault bookmark")
        XCTAssertEqual(NoteDestination.made.archiveFolder, "_inbox")
        XCTAssertEqual(NoteDestination.idea.archiveFolder, "_ideas")
        XCTAssertEqual(NoteDestination.inspiration.archiveFolder, "_inspiration")
    }

    // MARK: - One-of-four

    func testSettingADestinationReplacesTheLastOne() {
        let m = Memo(title: "T")
        m.destination = .inspiration
        m.destination = .idea
        XCTAssertEqual(m.destination, .idea,
                       "one-of-four: idea + inspiration is meaningless — the line is authorship")
    }

    /// An unreadable value must never be guessed as one that LEAVES. Degrading to `.personal`
    /// is the only safe direction.
    func testUnknownRawValueDegradesToPersonal() {
        let m = Memo(title: "T")
        m.destinationRaw = "portfolio-something-from-a-future-build"
        XCTAssertEqual(m.destination, .personal)
        m.destinationRaw = ""
        XCTAssertEqual(m.destination, .personal)
    }

    func testRoundTripsThroughTheStoredRawValue() {
        for d in NoteDestination.allCases {
            let m = Memo(title: "T")
            m.destination = d
            XCTAssertEqual(m.destinationRaw, d.rawValue)
            XCTAssertEqual(m.destination, d)
        }
    }

    // MARK: - Reserved words in the free tag field

    func testReservedMatchesCaseAndHashInsensitively() {
        XCTAssertEqual(NoteDestination.reserved("idea"), .idea)
        XCTAssertEqual(NoteDestination.reserved("#Idea"), .idea)
        XCTAssertEqual(NoteDestination.reserved("  INSPIRATION "), .inspiration)
        XCTAssertEqual(NoteDestination.reserved("personal"), .personal)
        XCTAssertEqual(NoteDestination.reserved("made"), .made)
        XCTAssertNil(NoteDestination.reserved("ideas"), "only the exact word is reserved")
        XCTAssertNil(NoteDestination.reserved("lisbon"))
    }

    /// Tuur's own question: select Idea, then type "inspiration" in the tag field. It must not
    /// become a tag — as a tag it would sit beside the chip meaning the opposite thing.
    func testTypingADestinationWordIsRefusedNotTagged() {
        let split = Memo.splitTagInput("lisbon, inspiration, furniture")
        XCTAssertEqual(split.accepted, ["lisbon", "furniture"])
        XCTAssertEqual(split.reserved, [.inspiration])
        XCTAssertEqual(NoteDestination.reservedRefusal(.inspiration),
                       "“Inspiration” is a destination — pick it above.")
    }

    func testOrdinaryTagInputIsUntouched() {
        XCTAssertEqual(Memo.parseTagInput("#lisbon, furniture\nwood"),
                       ["lisbon", "furniture", "wood"], "the existing contract, unchanged")
        XCTAssertEqual(Memo.parseTagInput("  ,  , #  "), [], "punctuation-only pieces still drop")
    }

    func testRepeatedReservedWordIsReportedOnce() {
        let split = Memo.splitTagInput("idea, #idea, IDEA")
        XCTAssertTrue(split.accepted.isEmpty)
        XCTAssertEqual(split.reserved, [.idea], "one refusal, not three")
    }
}
