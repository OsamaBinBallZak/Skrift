import Foundation

/// The Mac's live-recording DRAFT: the pure ownership-boundary math behind
/// `LiveRecordingSession` (`mocks/mac-live-transcription.html` m2) — pulled out here so the
/// rule can be pinned by tests without a microphone, a model, or an `@Observable` session.
///
/// The engine (`LiveCaptionEngine`) hands back `(full, committed)` every poll: `committed`
/// is rotated chunks that will NEVER change again, `full` is committed + a fresh
/// re-transcribe of the live window. This struct owns the split that turns that into a
/// draft a person can edit mid-take:
/// - `settledText` is the USER's — it only ever grows by the engine APPENDING a newly
///   committed chunk to its end; a person's own edit replaces it wholesale, and a later
///   append still lands at the end of whatever they left behind.
/// - `wetText` is the ENGINE's — the volatile tail, replaced wholesale every poll,
///   display-only, never user-editable.
/// - `everEdited` flips the moment a person's own edit lands, and never resets — it is the
///   finalize-time signal (`LiveRecordingSession.stop()`) for which authority (the
///   full-quality file pass, or the user's own settled text) owns the take's words.
struct LiveRecordingDraft: Equatable {
    private(set) var settledText: String = ""
    private(set) var wetText: String = ""
    private(set) var everEdited: Bool = false
    /// The engine's last-seen `committed` value — lets `absorb` compute the NEW suffix.
    /// Rotation only ever appends chunks, never rewrites one already seen (the phone's
    /// hard-won committed/volatile boundary — see `LiveCaptionEngine.captionParts`).
    private var lastCommitted: String = ""

    /// One poll's caption parts landing. Never sets `everEdited` — an engine append is not
    /// a person touching the draft.
    mutating func absorb(full: String, committed: String) {
        let suffix = Self.newSuffix(committed: committed, lastCommitted: lastCommitted)
        settledText = Self.appended(settledText, suffix)
        lastCommitted = committed
        wetText = Self.tail(full: full, committed: committed)
    }

    /// A person's own edit — replaces `settledText` wholesale (the bound editor's text) and
    /// marks the draft touched. Never rolled back by a later `absorb`: an append still
    /// lands at the end of whatever the person left behind, because `appended` always
    /// starts from the CURRENT `settledText`, edited or not.
    mutating func edit(settledText: String) {
        self.settledText = settledText
        everEdited = true
    }

    // MARK: - Pure rules (unit-tested — every rule `LiveRecordingSession` hangs off)

    /// `committed` only ever grows by appended chunks (the engine's rotation never rewrites
    /// one already seen) — so the NEW piece is `committed` with the `lastCommitted` prefix
    /// removed. Falls back to the whole value when `committed` doesn't start with what we
    /// last saw (an engine reset, or a shrunk value) — losing words is worse than a rare
    /// duplicated word.
    static func newSuffix(committed: String, lastCommitted: String) -> String {
        guard !committed.isEmpty else { return "" }
        guard committed.hasPrefix(lastCommitted) else { return committed }
        return String(committed.dropFirst(lastCommitted.count))
    }

    /// Append `suffix` to `settled` — one space between them when both sides have text,
    /// the same join the engine itself uses for its own committed chunks
    /// (`LiveCaptionEngine.committedText`) — EXCEPT when the engine sent the suffix with a
    /// leading paragraph break (a pause-rotate after a finished sentence, `chunkJoin`):
    /// that break is the phone-parity paragraph boundary and must survive into the user's
    /// settled text, not be flattened to a space.
    static func appended(_ settled: String, _ suffix: String) -> String {
        let piece = suffix.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !piece.isEmpty else { return settled }
        guard !settled.isEmpty else { return piece }
        let join = suffix.hasPrefix("\n\n") ? "\n\n" : " "
        return settled + join + piece
    }

    /// The volatile tail: `full` minus its `committed` prefix — whatever the engine hasn't
    /// rotated yet.
    static func tail(full: String, committed: String) -> String {
        guard !committed.isEmpty else { return full }
        guard full.hasPrefix(committed) else { return full }
        return String(full.dropFirst(committed.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
