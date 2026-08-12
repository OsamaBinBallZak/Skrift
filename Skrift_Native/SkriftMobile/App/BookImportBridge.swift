import Foundation

/// Carries an arriving `.skriftbook` from `AppURLHandler` to whatever is on
/// screen, so a book someone shared can be offered wherever the app happens to
/// be (mirrors `MemoOpenBridge`).
///
/// **Nothing is imported here.** A book someone AirDropped is a large, opinionated
/// thing to put in your library — hundreds of megabytes and a title you didn't
/// choose — so arrival only ever raises a sheet. The user decides.
@MainActor
final class BookImportBridge: ObservableObject {
    static let shared = BookImportBridge()

    /// The bundle waiting to be offered, with the manifest already read so the
    /// sheet can name the book and its size without unpacking anything.
    struct Pending: Identifiable, Equatable {
        let id = UUID()
        let url: URL
        let manifest: BookBundleManifest
        /// True when this book id is already in the library — the sheet says
        /// "Already in your books" instead of offering the import.
        let alreadyHave: Bool
    }

    @Published var pending: Pending?
    /// Set when a file arrived but could not be read as a book at all: a truncated
    /// archive, a manifest from a newer Skrift, a `.skriftbook` that isn't one.
    /// Better a plain refusal than a half-imported book.
    @Published var failure: String?

    private init() {}

    /// Read the manifest and raise the sheet. Cheap — the manifest is one small
    /// entry, so this never unpacks the audio just to ask the question.
    func offer(_ url: URL, library: AudiobookLibraryStore = .shared) {
        do {
            let manifest = try BookBundle.readManifest(at: url)
            pending = Pending(url: url,
                              manifest: manifest,
                              alreadyHave: BookBundleRules.alreadyImported(
                                manifest, existing: library.books.map(\.id)))
        } catch {
            failure = (error as? LocalizedError)?.errorDescription
                ?? "This file couldn't be opened as a Skrift book."
        }
    }
}
