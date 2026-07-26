import Foundation

/// The derived-title cut: what a note shows when it has no title of its own and
/// falls back to its opening words.
///
/// Breaks on a WORD boundary and marks the cut with an ellipsis. The rule used to
/// be a bare `prefix(80)`, which ends mid-word — *"…once I click the record button,
/// it s"* — and reads as a rendering fault rather than a truncation (Tuur,
/// 2026-07-26). It surfaced on an unrated note, where there is never a real title
/// to fall back FROM, so the derived one is always what you see.
///
/// SHARED on purpose: the same slice had been pasted into seven display sites
/// across both apps, so tuning one would have drifted it from the rest.
///
/// Deliberately NOT used by `MemoExporter.exportTitle` — that feeds the vault
/// FILENAME through `ObsidianPublisher.sanitizeFilename`, where an ellipsis would
/// rename notes on disk. A filename stem wants the plain hard cut.
enum NoteTitle {
    /// Longest derived title shown, in characters.
    static let limit = 80

    /// Clip `line` to `limit` on a word boundary, appending "…". Returned unchanged
    /// when it already fits.
    static func clip(_ line: String, limit: Int = NoteTitle.limit) -> String {
        guard line.count > limit else { return line }
        let head = line.prefix(limit)
        // Break at the last space so a word is never sliced in half. A single word
        // longer than the whole limit has no boundary to find — cut that one hard
        // rather than return an empty title.
        if let space = head.lastIndex(where: { $0.isWhitespace }) {
            let trimmed = head[..<space].trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { return trimmed + "…" }
        }
        return head.trimmingCharacters(in: .whitespaces) + "…"
    }
}
