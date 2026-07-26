import XCTest
@testable import SkriftMobile

/// The unrated-note model, phone side (locked with Tuur 2026-07-26):
/// **the rating is CONSENT — until you've judged a note, Skrift spends nothing on it
/// and shows it nowhere but back to you.** These pin the two places the phone used to
/// disagree with that.
@MainActor
final class UnratedConsentTests: XCTestCase {

    // ── the idea graph is consent-gated (round 5) ──

    /// Unrated notes must not appear as candidates in ANY other note's Related.
    /// Excluding them at INDEX time (not query time) also means their embedding is
    /// never paid for — and `EmbeddingIndex.sweep`'s orphan pass deletes the rows of
    /// a note whose rating goes back to 0.
    func testUnratedMemosAreNotIndexed() {
        let repo = NotesRepository(inMemory: true)
        let rated = Memo(title: "Rated", transcript: "The harbor at dawn.", significance: 0.5)
        let unrated = Memo(title: "Unrated", transcript: "A passing thought.", significance: 0)
        repo.context.insert(rated)
        repo.context.insert(unrated)
        repo.save()

        let ids = Set(JournalIndexService.snapshots(from: repo).map(\.id))
        XCTAssertTrue(ids.contains(rated.id))
        XCTAssertFalse(ids.contains(unrated.id),
                       "an unjudged note never joins the idea graph — in either direction")
    }

    /// …and a note that gets rated joins on the next sweep, with no other change.
    func testRatingANoteAdmitsItToTheIndex() {
        let repo = NotesRepository(inMemory: true)
        let memo = Memo(title: "Later rated", transcript: "Worth keeping after all.", significance: 0)
        repo.context.insert(memo)
        repo.save()
        XCTAssertFalse(Set(JournalIndexService.snapshots(from: repo).map(\.id)).contains(memo.id))

        memo.significance = 0.3
        repo.save()
        XCTAssertTrue(Set(JournalIndexService.snapshots(from: repo).map(\.id)).contains(memo.id))
    }

    // ── export is rated-only, everywhere ──

    /// The "All notes" option is gone from Settings, but a device that had STORED it
    /// must not keep publishing unrated notes — so `live` hard-codes the policy rather
    /// than reading the old key.
    func testLivePublishPolicyIsRatedOnlyRegardlessOfStoredSetting() {
        UserDefaults.standard.set("all", forKey: "skrift.publish.policy")
        defer { UserDefaults.standard.removeObject(forKey: "skrift.publish.policy") }

        let coordinator = PublishCoordinator.live(author: "T")
        XCTAssertEqual(coordinator.policy(), .importantOnly,
                       "a stale stored 'all' must not resurrect unrated export")
    }
}
