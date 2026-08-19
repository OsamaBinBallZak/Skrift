import XCTest
@testable import SkriftMobile

/// POLISH (iPad wave, v2). Exercises the parts that CAN be tested without MLX (honesty
/// contract — the sim can't run Metal-JIT MLX, so live generation is device-owed): the
/// device gate, the pure `PolishEscrow` round-trips (quote protection + memo-link + image
/// markers, via an injected generator), and the summary threshold. No `MLXPolishEngine`
/// is instantiated here.
final class IPadPolishTests: XCTestCase {

    // MARK: - Gate (runs on the iPhone 17 sim, which is unsupported)

    func testPolishGateUnsupportedOnSimulator() {
        // The unit suite runs on the simulator; MLX needs a real Metal GPU, so the gate is
        // false here (and on every phone). Capable-iPad behavior is device-owed.
        XCTAssertFalse(PolishGate.isSupported)
    }

    // MARK: - Escrow round-trips (identity + mutating generators, MLX-free)

    func testCopyEditKeepsQuoteLinkAndMarker() async throws {
        let uuid = UUID()
        let quote = "> To be, or not to be, that is the question."
        let ramble = "This ties into [[memo:\(uuid.uuidString)|Chapter Two]] and the sketch. [[img_001]] It matters."
        let transcript = quote + "\n\n" + ramble

        // Identity generator: the LLM "changes nothing", so every escrowed piece must return.
        let result = try await PolishEscrow.copyEdit(transcript) { $0 }

        XCTAssertTrue(QuoteProtection.leadingQuoteIntact(original: transcript, edited: result),
                      "the captured quote block must survive byte-identical")
        XCTAssertTrue(result.contains("[[memo:\(uuid.uuidString)|Chapter Two]]"),
                      "the memo link must be reattached")
        XCTAssertTrue(result.contains("[[img_001]]"), "the image marker must be reinserted")
    }

    func testCopyEditProtectsQuoteWhileEditingRamble() async throws {
        let quote = "> Immutable words."
        let transcript = quote + "\n\n" + "some spoken ramble here"

        // A generator that rewrites the ramble (uppercase) must NOT be able to touch the quote.
        let result = try await PolishEscrow.copyEdit(transcript) { $0.uppercased() }

        XCTAssertTrue(result.hasPrefix(quote), "quote block stays byte-identical at the top")
        XCTAssertTrue(QuoteProtection.leadingQuoteIntact(original: transcript, edited: result))
        XCTAssertTrue(result.contains("SOME SPOKEN RAMBLE HERE"), "the ramble WAS edited")
    }

    func testCopyEditQuoteOnlyCaptureSkipsTheLLM() async throws {
        let transcript = "> A lone captured quote.\n> second line."
        var generatorCalled = false

        let result = try await PolishEscrow.copyEdit(transcript) { input in
            generatorCalled = true
            return input
        }

        XCTAssertEqual(result, transcript, "a quote-only capture (no ramble) is returned untouched")
        XCTAssertFalse(generatorCalled, "nothing for the LLM to edit → it is never called")
    }

    func testCopyEditFallsBackWhenLinkTitleIsLost() async throws {
        let uuid = UUID()
        let transcript = "Refer to [[memo:\(uuid.uuidString)|Chapter Two]] soon."

        // The generator drops the title, so the link can't be reattached → the WHOLE body
        // falls back to unedited (never ship a lost reference).
        let result = try await PolishEscrow.copyEdit(transcript) { _ in
            "totally different text without the title"
        }

        XCTAssertEqual(result, transcript, "a lost link title falls the body back to the original")
    }

    // MARK: - Summary threshold (Mac parity)

    func testSummaryThresholdMirrorsMac() {
        XCTAssertEqual(PolishEscrow.summaryMinWords, 75, "matches BatchRunner effectiveSummaryMinWords default")
        XCTAssertFalse(PolishEscrow.wordsMeetSummaryThreshold("just a few words here"))
        let long = Array(repeating: "word", count: 80).joined(separator: " ")
        XCTAssertTrue(PolishEscrow.wordsMeetSummaryThreshold(long))
    }

    // MARK: - Copy-edit token budget (restored 2026-08-18 — the flat 1024 cut long notes)

    /// The budget is sized from the INPUT: floor 1024 (short notes lose nothing — the
    /// cap is a ceiling, not a target), ×1.5 over the ~4-chars/token estimate, hard
    /// ceiling 8192. Both engines read this one function (PolishPrompts) — the old
    /// Python backend had exactly this per-memo sizing and the native ports lost it.
    func testCopyEditTokenBudgetScalesWithInput() {
        XCTAssertEqual(PolishPrompts.copyEditTokenBudget(forInput: "short note"), 1024, "floor")
        let words2k = Array(repeating: "word", count: 2_000).joined(separator: " ")   // ~10k chars → ~2.5k tokens
        let budget = PolishPrompts.copyEditTokenBudget(forInput: words2k)
        XCTAssertGreaterThan(budget, 3_000, "a long note gets room to finish")
        XCTAssertLessThanOrEqual(budget, 8_192)
        let huge = String(repeating: "x", count: 200_000)
        XCTAssertEqual(PolishPrompts.copyEditTokenBudget(forInput: huge), 8_192, "ceiling bounds a runaway")
    }

    /// Truncation guard: an output that fills ~the whole cap most likely stopped at
    /// the cap, not at end-of-text — callers keep the unedited body (a raw note is
    /// honest; a half note is silent data loss).
    func testLooksTruncated() {
        let cap = 1_024
        XCTAssertTrue(PolishPrompts.looksTruncated(output: String(repeating: "x", count: 4_096), cap: cap))
        XCTAssertFalse(PolishPrompts.looksTruncated(output: String(repeating: "x", count: 2_000), cap: cap))
    }

    // MARK: - The wall cure + shrink guard (2026-08-19)

    /// Long text with no breaks gets deterministic paragraphs (~4 sentences each);
    /// already-paragraphed or short text passes through byte-identical.
    func testEnsureParagraphsBreaksAWall() {
        let wall = Array(repeating: "Dit is een zin over het atelier en het licht.", count: 30).joined(separator: " ")
        let out = PolishPrompts.ensureParagraphs(wall)
        XCTAssertGreaterThanOrEqual(out.components(separatedBy: "\n\n").count, 5)
        XCTAssertEqual(out.replacingOccurrences(of: "\n\n", with: " "), wall, "content untouched, only breaks added")
        let already = "One.\n\nTwo.\n\nThree." + String(repeating: " padding zin hier.", count: 60)
        XCTAssertEqual(PolishPrompts.ensureParagraphs(already), already)
        XCTAssertEqual(PolishPrompts.ensureParagraphs("Kort."), "Kort.")
    }

    /// Output far below the input's word count = the model ate the note (fx5).
    func testLostTooMuch() {
        let input = Array(repeating: "word", count: 100).joined(separator: " ")
        XCTAssertTrue(PolishPrompts.lostTooMuch(input: input, output: "just a few words left here"))
        XCTAssertFalse(PolishPrompts.lostTooMuch(input: input, output: Array(repeating: "word", count: 70).joined(separator: " ")))
        XCTAssertFalse(PolishPrompts.lostTooMuch(input: "tiny note", output: "tiny"), "tiny notes may compress")
    }

    // (The v1 auto-polish tracker was REMOVED in v2 — the iPad polishes only on
    // the visible Polish verb, the Mac's idiom; Tuur 2026-07-23.)
}
