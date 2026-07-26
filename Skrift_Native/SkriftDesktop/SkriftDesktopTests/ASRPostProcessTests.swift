import XCTest

/// `ASRPostProcess` — the deterministic tail both apps' transcription runs through.
/// What's worth pinning is the ORDER, because it's load-bearing and invisible: a diff
/// that reshuffles these passes doesn't look like a bug.
final class ASRPostProcessTests: XCTestCase {

    /// NOTE the LEADING SPACE on each token: `BPEMerge.mergeBPETokens` starts a new
    /// word on `hasPrefix(" ")`, so space-less fixtures merge into ONE word — which is
    /// exactly how the first draft of these tests crashed.
    private func tokens(_ pairs: [(String, TimeInterval, TimeInterval)]) -> [RawToken] {
        pairs.map { RawToken(token: $0.0, startTime: $0.1, endTime: $0.2) }
    }

    /// The ordinary path: tokens merge into words, timings come out aligned.
    func testMergesTokensIntoTimedWords() async {
        let r = await ASRPostProcess.finish(
            rawText: "hello world", tokens: tokens([(" hello", 0, 0.4), (" world", 0.5, 0.9)]),
            confidence: 0.9, durationMs: 120,
            rms: { 0.5 }, rescore: { _ in nil })

        XCTAssertEqual(r.text, "hello world")
        XCTAssertEqual(r.wordTimings.map(\.word), ["hello", "world"])
        XCTAssertEqual(r.wordTimings.first?.start, 0)
        XCTAssertEqual(r.confidence, 0.9)
        XCTAssertEqual(r.durationMs, 120)
        XCTAssertFalse(r.markersInjected)
    }

    /// The phantom guard runs FIRST: a near-silent file with a hallucinated word or two
    /// yields nothing, and nothing downstream gets to run on it.
    func testPhantomGuardDropsLowEnergyScraps() async {
        let r = await ASRPostProcess.finish(
            rawText: "you", tokens: tokens([(" you", 0, 0.2)]),
            confidence: 0.3, durationMs: 50,
            imageManifest: [ImageManifestEntry(filename: "a.jpg", offsetSeconds: 0)],
            rms: { 0.001 }, rescore: { _ in XCTFail("nothing runs after the guard"); return nil })

        XCTAssertEqual(r.text, "")
        XCTAssertTrue(r.wordTimings.isEmpty)
        XCTAssertFalse(r.markersInjected, "no markers on a dropped transcript")
    }

    /// A real transcript is never dropped, however quiet the recording.
    func testQuietButRealTranscriptSurvives() async {
        let words = (0..<10).map { (" w\($0)", TimeInterval($0), TimeInterval($0) + 0.5) }
        let r = await ASRPostProcess.finish(
            rawText: "w0 w1 w2 w3 w4 w5 w6 w7 w8 w9", tokens: tokens(words),
            confidence: 0.8, durationMs: 900, rms: { 0.0001 }, rescore: { _ in nil })
        XCTAssertEqual(r.wordTimings.count, 10)
    }

    /// The vocab rescore replaces the text AND re-aligns, so each timing keeps its
    /// word — if the re-align were skipped the timings would detach from the words.
    func testRescoreReplacesTextAndKeepsTimingsAttached() async {
        let r = await ASRPostProcess.finish(
            rawText: "script is nice", tokens: tokens([(" script", 0, 0.4), (" is", 0.5, 0.6), (" nice", 0.7, 1.0)]),
            confidence: 0.9, durationMs: 200,
            rms: { 0.5 }, rescore: { _ in "Skrift is nice" })

        XCTAssertEqual(r.text, "Skrift is nice")
        XCTAssertEqual(r.wordTimings.map(\.word), ["Skrift", "is", "nice"])
        XCTAssertEqual(r.wordTimings[0].start, 0, "the corrected word keeps the original timing")
        XCTAssertEqual(r.wordTimings[2].end, 1.0)
    }

    /// nil from the rescore means "no change" — never an empty transcript.
    func testNilRescoreLeavesTheTextAlone() async {
        let r = await ASRPostProcess.finish(
            rawText: "unchanged text", tokens: tokens([(" unchanged", 0, 0.4), (" text", 0.5, 0.9)]),
            confidence: 0.9, durationMs: 100, rms: { 0.5 }, rescore: { _ in nil })
        XCTAssertEqual(r.text, "unchanged text")
    }

    /// ORDER, the one that matters most: markers are placed against the RESCORED words.
    /// Run before the rescore, and a marker would anchor to a word that no longer exists.
    func testMarkersArePlacedAfterTheRescore() async {
        let r = await ASRPostProcess.finish(
            rawText: "script rules", tokens: tokens([(" script", 0, 1.0), (" rules", 1.1, 2.0)]),
            confidence: 0.9, durationMs: 300,
            imageManifest: [ImageManifestEntry(filename: "a.jpg", offsetSeconds: 1.5)],
            rms: { 0.5 }, rescore: { _ in "Skrift rules" })

        XCTAssertTrue(r.markersInjected)
        XCTAssertTrue(r.text.contains("[[img_001]]"), "a marker was inserted")
        XCTAssertTrue(r.text.contains("Skrift"), "…into the CORRECTED text, not the raw one")
        XCTAssertFalse(r.text.contains("script"))
    }

    /// No manifest ⇒ no markers, and the flag stays honest.
    func testNoManifestMeansNoMarkers() async {
        let r = await ASRPostProcess.finish(
            rawText: "just words", tokens: tokens([(" just", 0, 0.4), (" words", 0.5, 0.9)]),
            confidence: 0.9, durationMs: 100, rms: { 0.5 }, rescore: { _ in nil })
        XCTAssertFalse(r.markersInjected)
        XCTAssertFalse(r.text.contains("[[img_"))
    }

    /// RMS is only consulted for a suspiciously small transcript — a full one must not
    /// pay for a whole-file decode.
    func testRMSIsNotComputedForARealTranscript() async {
        var asked = false
        _ = await ASRPostProcess.finish(
            rawText: "one two three four five",
            tokens: tokens([(" one", 0, 0.2), (" two", 0.3, 0.5), (" three", 0.6, 0.8),
                            (" four", 0.9, 1.1), (" five", 1.2, 1.4)]),
            confidence: 0.9, durationMs: 200,
            rms: { asked = true; return 0.5 }, rescore: { _ in nil })
        XCTAssertFalse(asked, "a real transcript skips the full-file RMS decode")
    }
}
