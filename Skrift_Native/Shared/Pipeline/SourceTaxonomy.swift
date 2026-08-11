import Foundation

/// The unified source taxonomy — ONE copy of every source kind's glyph + label
/// (CLAUDE.md "Unified source taxonomy"; single-sourced 2026-07-21 after a
/// third hardcoded copy appeared). The Mac's queue rows, its quiet rows, and
/// the phone's row/chip glyphs all read THESE — a symbol renamed here renames
/// everywhere, and nowhere else.
enum SourceKind: Equatable {
    case audiobookQuote, video, captureURL, captureImage, captureText,
         captureFile, captureOther, appleNote, voiceMemo, typedNote

    /// SF Symbol.
    var glyph: String {
        switch self {
        case .audiobookQuote: return "book.closed.fill"
        case .video:          return "video.fill"
        case .captureURL:     return "link"
        case .captureImage:   return "photo"
        case .captureText:    return "text.quote"
        case .captureFile:    return "doc"
        case .captureOther:   return "square.and.arrow.down"
        case .appleNote:      return "note.text"
        case .voiceMemo:      return "mic.fill"
        case .typedNote:      return "square.and.pencil"
        }
    }

    /// Human label (detail "source" lines, chips).
    var label: String {
        switch self {
        case .audiobookQuote: return "Audiobook quote"
        case .video:          return "Video"
        case .captureURL:     return "Link"
        case .captureImage:   return "Image"
        case .captureText:    return "Text"
        case .captureFile:    return "File"
        case .captureOther:   return "Capture"
        case .appleNote:      return "Apple Note"
        case .voiceMemo:      return "Voice memo"
        case .typedNote:      return "Note"
        }
    }

    /// Row-title fallback for a note with no title and no words yet. A typed
    /// note says "Note" — "Voice note" on something you wrote reads as a bug
    /// (mocks/mac-new-note.html m3); everything else keeps the historic copy.
    var emptyTitleFallback: String {
        self == .typedNote ? "Note" : "Voice note"
    }

    /// Kind of a synced `Memo` — priority: audiobook quote → video → capture
    /// subtype → audio/no-audio (mirrors the Mac's `PipelineFile` descriptor;
    /// a book capture and a video both carry audio, so type alone can't tell).
    static func of(_ memo: Memo) -> SourceKind {
        if let book = memo.metadata?.bookTitle, !book.isEmpty { return .audiobookQuote }
        if let data = memo.metadataData,
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let media = obj["mediaSource"] as? String {
            if media == "video" { return .video }
            // A note born typed (the Mac's ✎/⌘N verb — `MacMemoAuthor.typedNote`).
            // Without the marker a no-audio memo reads as an Apple Note import below.
            if media == "typed" { return .typedNote }
        }
        if let shared = SharedContent.decode(from: memo.metadataData) {
            switch shared.type {
            case .url:   return .captureURL
            case .image: return .captureImage
            case .text:  return .captureText
            case .file:  return .captureFile
            }
        }
        return memo.audioFilename.isEmpty ? .appleNote : .voiceMemo
    }
}
