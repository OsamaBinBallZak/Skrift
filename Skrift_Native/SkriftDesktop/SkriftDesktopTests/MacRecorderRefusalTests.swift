import AVFoundation
import XCTest
import SwiftData

/// The refusal mapping — why a take couldn't start, and whether the user is given a way out.
///
/// Written after the 2026-07-28 regression, where Record "did nothing" for a whole session:
/// `-miccheck` eventually read `DENIED`, meaning the app had been refusing correctly the
/// entire time while offering nothing but a sentence to read. The distinction these tests
/// pin is the one that costs an afternoon when it's wrong: a denial is a DEAD END that macOS
/// will never re-prompt for, so it must carry a button to Settings, whereas an absent
/// microphone is fixed by plugging one in and Settings would be a red herring.
final class MacRecorderRefusalTests: XCTestCase {

    // MARK: - which statuses are a dead end

    func testDeniedIsADeadEndThatOffersSettings() {
        let refusal = MacRecorder.refusal(for: .denied)
        XCTAssertEqual(refusal, .permissionDenied)
        XCTAssertTrue(refusal.fixedInPrivacySettings,
                      "a denial is only clearable in Settings — without the button the user has nowhere to go")
    }

    func testRestrictedIsADeadEndToo() {
        let refusal = MacRecorder.refusal(for: .restricted)
        XCTAssertEqual(refusal, .permissionRestricted)
        XCTAssertTrue(refusal.fixedInPrivacySettings)
    }

    /// Reaching the mapping at all means access was withheld, so `.notDetermined` here is a
    /// declined (or un-presentable) prompt, not a pending one. Reporting it as anything
    /// softer sends the user waiting for a dialog macOS will never show — exactly how a CLI
    /// `-recordcheck` run poisoned this grant in the first place.
    func testNotDeterminedAfterAFailedRequestReadsAsDenied() {
        XCTAssertEqual(MacRecorder.refusal(for: .notDetermined), .permissionDenied)
    }

    // MARK: - what Settings can't fix

    func testHardwareAndEngineFailuresDoNotSendTheUserToSettings() {
        XCTAssertFalse(MacRecorder.Refusal.noInputDevice.fixedInPrivacySettings,
                       "no mic is fixed by plugging one in; Settings would be a wild goose chase")
        XCTAssertFalse(MacRecorder.Refusal.noUsableFormat.fixedInPrivacySettings,
                       "a 0 Hz format is a Sound ▸ Input problem, not a Privacy one")
        XCTAssertFalse(MacRecorder.Refusal.engineFailed("boom").fixedInPrivacySettings)
    }

    // MARK: - every refusal says something, and says it differently

    func testEveryRefusalCarriesADistinctNonEmptyMessage() {
        let all: [MacRecorder.Refusal] = [
            .noInputDevice, .permissionDenied, .permissionRestricted,
            .noUsableFormat, .engineFailed("the engine said no"),
        ]
        for refusal in all {
            XCTAssertFalse(refusal.message.isEmpty, "\(refusal) must explain itself")
        }
        XCTAssertEqual(Set(all.map(\.message)).count, all.count,
                       "two refusals reading the same is how 'no mic' and 'no permission' got confused")
    }

    func testEngineFailureQuotesTheUnderlyingReason() {
        XCTAssertTrue(MacRecorder.Refusal.engineFailed("kAudioUnitErr_TooManyFramesToProcess")
            .message.contains("kAudioUnitErr_TooManyFramesToProcess"),
                      "CoreAudio's own words are the only diagnostic there is here")
    }

    /// The denial message must NOT promise a prompt. macOS won't show one, and telling the
    /// user to "allow it when asked" is the difference between a fixable state and a bug
    /// report.
    func testDenialMessageSaysMacOSWillNotAskAgain() {
        let message = MacRecorder.Refusal.permissionDenied.message
        XCTAssertTrue(message.contains("won't ask again"), "got: \(message)")
        XCTAssertTrue(message.contains("Microphone"), "it has to name the pane: \(message)")
    }

    func testPrivacySettingsDeepLinkIsAUsableURL() {
        let url = URL(string: MacRecorder.Refusal.privacySettingsURL)
        XCTAssertNotNil(url, "an unparseable deep link makes the Open Settings button a no-op")
        XCTAssertEqual(url?.scheme, "x-apple.systempreferences")
    }
}

/// The rating floor, from the angle the 2026-07-28 harness run exposed: it is not enough for
/// the CAPTURE path to ask for no floor, because it is not the only thing that authors Memos.
/// `MemoCloudReconciler`'s sweep calls `backfill` — which takes the default `floorSignificance:
/// true` — over every local row that lacks one, on its own schedule. It won that race against a
/// real Mac take and rated it 0.1.
final class LocalRecordingFloorTests: XCTestCase {

    private func cloudContext() throws -> ModelContext {
        ModelContext(try ModelContainer(for: Memo.self, MemoAsset.self,
                                        configurations: ModelConfiguration(isStoredInMemoryOnly: true,
                                                                           cloudKitDatabase: .none)))
    }

    private func take() -> PipelineFile {
        let pf = PipelineFile(id: UUID().uuidString, filename: "memo_x.m4a",
                              path: tempAudio().path, sourceType: .audio)
        pf.isLocalRecording = true
        return pf
    }

    private func tempAudio() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
        try? Data(repeating: 0, count: 512).write(to: url)
        return url
    }

    /// THE regression: the sweep's own entry point, with its own defaults, on a real take.
    func testTheReconcileSweepCannotFloorARecording() throws {
        let cloud = try cloudContext()
        let pf = take()

        XCTAssertEqual(try MacMemoAuthor.backfill(files: [pf], into: cloud), 1)

        let memo = try XCTUnwrap(try cloud.fetch(FetchDescriptor<Memo>()).first)
        XCTAssertEqual(memo.significance, 0,
                       "whoever authors a take first, it stays unrated — the rating is consent")
    }

    /// The same call that floored it, spelled out: even asked explicitly to floor, a recording
    /// doesn't. The flag is the row's own fact and outranks the caller's opinion.
    func testAnExplicitFloorRequestStillCannotRateARecording() throws {
        let cloud = try cloudContext()
        let memo = try MacMemoAuthor.author(for: take(), audioURL: nil, into: cloud,
                                            floorSignificance: true)
        XCTAssertEqual(memo?.significance, 0)
    }

    /// The other edge, unchanged: an import is a request to process, so it still floors.
    func testAnImportStillFloors() throws {
        let cloud = try cloudContext()
        let pf = PipelineFile(id: UUID().uuidString, filename: "dropped.m4a",
                              path: tempAudio().path, sourceType: .audio)
        XCTAssertEqual(try MacMemoAuthor.backfill(files: [pf], into: cloud), 1)
        XCTAssertEqual(try cloud.fetch(FetchDescriptor<Memo>()).first?.significance, 0.1)
    }

    /// A rating the user actually gave survives either way — the flag governs the FLOOR, and
    /// a judged note is judged whatever door it came through.
    func testARatedRecordingKeepsItsRating() throws {
        let cloud = try cloudContext()
        let pf = take()
        pf.significance = 0.8
        let memo = try MacMemoAuthor.author(for: pf, audioURL: nil, into: cloud)
        XCTAssertEqual(memo?.significance, 0.8)
    }

    func testAFreshPipelineFileIsNotARecordingUntilSaidOtherwise() {
        XCTAssertFalse(PipelineFile(id: UUID().uuidString, filename: "a.m4a").isLocalRecording,
                       "the default must be the import behaviour — every other door relies on it")
    }
}

/// Which `Memo` a Mac-recorded file belongs to. The naming convention that works for every
/// PHONE memo is actively wrong here: a take's file is `memo_<uuid>.m4a` too, but that UUID
/// belongs to the audio file (`RecordingCore.filename()`), while the Memo is authored under
/// the row's `id`. Preferring the filename returns a UUID no Memo has, and every Mac→cloud
/// write silently no-ops — found 2026-07-28 when clearing a bad rating on a real take updated
/// the Mac and left the phone's copy at 0.1.
final class RecordingMemoIdentityTests: XCTestCase {

    private func cloudContext() throws -> ModelContext {
        ModelContext(try ModelContainer(for: Memo.self, MemoAsset.self, MemoEnhancement.self,
                                        configurations: ModelConfiguration(isStoredInMemoryOnly: true,
                                                                           cloudKitDatabase: .none)))
    }

    /// The exact shape of a Mac take: two DIFFERENT UUIDs, one in the id and one in the name.
    private func take() -> PipelineFile {
        PipelineFile(id: "11111111-1111-4111-8111-111111111111",
                     filename: "memo_22222222-2222-4222-8222-222222222222.m4a",
                     path: "/tmp/x.m4a", sourceType: .audio)
    }

    func testARecordingIsKeyedByItsRowIdNotItsFilename() {
        let pf = take()
        pf.isLocalRecording = true
        XCTAssertEqual(MacCloudWriteBack.memoID(for: pf), UUID(uuidString: pf.id),
                       "the filename's UUID names the audio file, not the Memo")
    }

    /// Unchanged for everything else: a phone-synced memo IS identified by its filename, and
    /// that path must not move.
    func testAPhoneMemoIsStillKeyedByItsFilename() {
        XCTAssertEqual(MacCloudWriteBack.memoID(for: take()),
                       UUID(uuidString: "22222222-2222-4222-8222-222222222222"))
    }

    /// The store-resolved lookup rescues the case no naming rule can: a take recorded BEFORE
    /// `isLocalRecording` existed, whose flag is false but whose Memo is under the row id.
    func testResolveFindsTheMemoOfAPreFlagRecording() throws {
        let ctx = try cloudContext()
        let pf = take()                                   // isLocalRecording == false
        let rowID = try XCTUnwrap(UUID(uuidString: pf.id))
        ctx.insert(Memo(id: rowID, audioFilename: pf.filename))
        try ctx.save()

        XCTAssertEqual(MacCloudWriteBack.resolve(for: pf, in: ctx)?.id, rowID,
                       "asking the store beats guessing from a name")
    }

    func testResolveStillFindsAPhoneMemoByFilename() throws {
        let ctx = try cloudContext()
        let pf = take()
        let fileID = try XCTUnwrap(UUID(uuidString: "22222222-2222-4222-8222-222222222222"))
        ctx.insert(Memo(id: fileID, audioFilename: pf.filename))
        try ctx.save()

        XCTAssertEqual(MacCloudWriteBack.resolve(for: pf, in: ctx)?.id, fileID)
    }

    /// A local-only file has no Memo either way — resolve must not invent one, or a write-back
    /// would orphan itself onto an unrelated note.
    func testResolveReturnsNilWhenNeitherCandidateExists() throws {
        XCTAssertNil(MacCloudWriteBack.resolve(for: take(), in: try cloudContext()))
    }

    /// The end of the chain that actually broke: the enhancement write-back for a Mac take.
    func testTheWriteBackReachesARecordingsMemo() throws {
        let ctx = try cloudContext()
        let pf = take()
        pf.isLocalRecording = true
        let rowID = try XCTUnwrap(UUID(uuidString: pf.id))
        ctx.insert(Memo(id: rowID, audioFilename: pf.filename))
        try ctx.save()
        pf.enhancedCopyedit = "polished on the Mac"

        let written = try MacCloudWriteBack.upsert(for: pf, into: ctx, deviceID: "mac-1")
        XCTAssertEqual(written?.memoID, rowID, "the Mac's polish must reach the take it polished")
    }
}
