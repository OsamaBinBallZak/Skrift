import Foundation

/// WHERE a note goes when it leaves Skrift — one of four, never two.
///
/// **The destination is a PRIVACY BOUNDARY, not a filing shelf.** That is Tuur's reason for
/// the whole feature (2026-08-26): his own thoughts must never be read by AI, while his ideas
/// and inspirations are the things he *wants* an AI to work out with him. Every rule in this
/// file falls out of that one fact, so read it before changing any of them:
///
/// - **One-of-four, never two.** The engine could write a memo to several destinations
///   (`ExportLedger` is keyed per destination folder, so N destinations are N independent
///   ledgers) — it is refused on purpose. Allow two and `personal` + `idea` becomes
///   expressible, which is a private thought sitting in a repo an AI reads: the exact
///   outcome the feature exists to prevent.
/// - **`idea` + `inspiration` is meaningless, not merely unsupported.** The line between them
///   is AUTHORSHIP — an inspiration is someone else's work, an idea is his own intent — and
///   nothing can be both. The photograph that *gave him an idea* is ONE note, filed `.idea`
///   ("that's actually how it always happens"); `.inspiration` is the narrower bucket, for a
///   thing he liked with no idea attached yet.
/// - **A stored field, NOT a tag string.** It is *rendered* as a chip beside the tags, which
///   is what he asked for, but a literal tag would mean typing `idea` in the free tag field
///   silently re-routes a note — a typo by another name. `reserved(_:)` is what refuses that.
///
/// `.personal` is the default and means exactly today's behaviour: the note goes to the
/// Obsidian vault picked in Settings, nothing else changes. The other three are inert until
/// the user turns destinations on and picks their folders.
enum NoteDestination: String, CaseIterable, Codable, Sendable {
    /// His own thoughts → the Obsidian vault. The default, and off-limits to the archive.
    case personal
    /// Something he MADE → the archive's `_inbox/`, to be sorted into an item folder.
    case made
    /// Something he wants to make — HIS intent → the archive's `_ideas/`.
    case idea
    /// Someone ELSE's work that he liked → the archive's `_inspiration/`.
    case inspiration

    /// The chip's word.
    var label: String {
        switch self {
        case .personal:    "Personal"
        case .made:        "Made"
        case .idea:        "Idea"
        case .inspiration: "Inspiration"
        }
    }

    /// Does this destination leave Skrift's private side? Drives the chip's colour (one
    /// family is private, three are public) and the "AI reads this" line — the user should be
    /// able to see which side of the boundary a note is on without reading a word.
    var isArchive: Bool { self != .personal }

    /// The folder each archive destination writes into, relative to the picked archive root.
    /// `nil` for `.personal`, which uses the existing Obsidian vault bookmark instead.
    var archiveFolder: String? {
        switch self {
        case .personal:    nil
        case .made:        "_inbox"
        case .idea:        "_ideas"
        case .inspiration: "_inspiration"
        }
    }

    /// The word a user might type that means "this is a destination, not a tag". Matched
    /// case- and `#`-insensitively so `#Idea`, `idea` and `IDEA` all land here.
    static func reserved(_ word: String) -> NoteDestination? {
        let key = word.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "#", with: "")
            .lowercased()
        return allCases.first { $0.rawValue == key }
    }

    /// The refusal shown when one of the four is typed into the free tag field. Names the
    /// control that actually does the thing rather than silently dropping the word.
    static func reservedRefusal(_ d: NoteDestination) -> String {
        "“\(d.label)” is a destination — pick it above."
    }
}
