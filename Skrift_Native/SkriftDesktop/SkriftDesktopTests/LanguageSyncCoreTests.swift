import XCTest
import SwiftData

/// `LanguageSyncCore` — the transcription-language mode reconciling across devices.
/// It rides the `VocabularyRecord` carrier on its OWN stamp, so the two settings never
/// clobber each other.
final class LanguageSyncCoreTests: XCTestCase {

    private func carrier(multilingual: Bool = false,
                         languageAt: Date = Date.distantPast,
                         wordsAt: Date = Date(timeIntervalSince1970: 1_000)) -> VocabularyRecord {
        VocabularyRecord(words: ["Skrift"], modifiedAt: wordsAt,
                         multilingual: multilingual, languageModifiedAt: languageAt)
    }

    private let older = Date(timeIntervalSince1970: 1_000)
    private let newer = Date(timeIntervalSince1970: 2_000)

    // ── the melChunkContext derivation (the actual bug) ──

    /// The whole reason the shared type exists: the Mac used to pass FluidAudio's
    /// `.default` (mel ON = English-tuned) with no way to change it.
    func testMelChunkContextDerivation() {
        XCTAssertTrue(ASRLanguageMode.english.melChunkContext, "English keeps the v3 default")
        XCTAssertFalse(ASRLanguageMode.multilingual.melChunkContext, "Multilingual turns mel OFF")
        XCTAssertEqual(ASRLanguageMode.from(multilingual: true), .multilingual)
        XCTAssertEqual(ASRLanguageMode.from(multilingual: false), .english)
    }

    // ── LWW ──

    func testRemoteNewerIsAdopted() {
        let r = carrier(multilingual: true, languageAt: newer)
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: false, localModifiedAt: older,
                                                 records: [r]),
                       .adoptRemote(multilingual: true, modifiedAt: newer))
    }

    func testLocalNewerIsPushedOntoTheCarrier() {
        let r = carrier(multilingual: false, languageAt: older)
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: true, localModifiedAt: newer,
                                                 records: [r]),
                       .pushedLocal(stamp: newer))
        XCTAssertTrue(r.multilingual, "the carrier now holds the local choice")
        XCTAssertEqual(r.languageModifiedAt, newer)
    }

    func testEqualStampsDoNothing() {
        let r = carrier(multilingual: true, languageAt: newer)
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: true, localModifiedAt: newer,
                                                 records: [r]), .noop)
    }

    /// THE ONE THAT MATTERS: a device that has never touched the setting must not
    /// broadcast its default. Otherwise a fresh Mac would push "English" and silently
    /// undo the Multilingual chosen on the phone.
    func testADeviceThatNeverChoseNeverPushesItsDefault() {
        let r = carrier(multilingual: true, languageAt: newer)
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: false,
                                                  localModifiedAt: .distantPast,
                                                  records: [r]),
                       .adoptRemote(multilingual: true, modifiedAt: newer),
                       "it ADOPTS instead of pushing")
        XCTAssertTrue(r.multilingual, "and the carrier is left alone")
    }

    /// Nobody anywhere has chosen → nothing to do (don't stamp a default as a choice).
    func testNoOpinionAnywhereIsNoop() {
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: false,
                                                  localModifiedAt: .distantPast,
                                                  records: [carrier()]), .noop)
    }

    /// No carrier yet: creating the row belongs to the vocab reconcile (it owns the
    /// row's lifecycle), so this must not invent one.
    func testNoCarrierIsNoop() {
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: true, localModifiedAt: newer,
                                                  records: []), .noop)
    }

    // ── independence from the word list ──

    /// The point of the separate stamp: a NEWER word list must not drag a STALE language
    /// value over a local choice made later.
    func testAFreshWordListDoesNotClobberALaterLanguageChoice() {
        // Carrier: words edited "now", language chosen long ago.
        let r = carrier(multilingual: false, languageAt: older, wordsAt: newer)
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: true, localModifiedAt: newer,
                                                  records: [r]),
                       .pushedLocal(stamp: newer))
        XCTAssertTrue(r.multilingual)
        XCTAssertEqual(r.modifiedAt, newer, "the words' own stamp is untouched")
        XCTAssertEqual(r.words, ["Skrift"], "and so is the list")
    }

    /// Newest-by-WORDS is the row both cores agree on, so the language reads from the
    /// same row the vocab reconcile keeps.
    func testPicksTheSameCarrierTheVocabCoreWouldKeep() {
        let stale = carrier(multilingual: false, languageAt: newer, wordsAt: older)
        let winner = carrier(multilingual: true, languageAt: older, wordsAt: newer)
        XCTAssertEqual(LanguageSyncCore.reconcile(localMultilingual: false,
                                                  localModifiedAt: .distantPast,
                                                  records: [stale, winner]),
                       .adoptRemote(multilingual: true, modifiedAt: older))
    }
}
