import Foundation

/// HOW a note is written, as opposed to WHERE (`NoteDestination`). Two shapes, because the
/// two readers want opposite things:
///
/// - **`.obsidian`** — exactly today's behaviour, unchanged. The picked folder gets a
///   `Skrift/` home, notes are named after their title, media lives in `Recordings/`,
///   `Images/` and `Documents/`, and images are `![[wiki embeds]]`. That layout was signed
///   off (`mocks/vault-folder-model.html`, 2026-08-14) and it is right for a vault.
///
/// - **`.archive`** — flat. One markdown file per entry with its media BESIDE it sharing the
///   same basename, named by timestamp, inside a month folder, and images written as plain
///   `![](file.jpg)`. A vault-relative `![[image.png]]` is exactly what makes a note
///   un-shareable outside the vault that defines it; a relative markdown link renders in
///   Obsidian too AND survives being read by anything else. The archive's rule is that the
///   data has to be able to walk out whole.
///
/// The profile follows the note's destination, so nothing about the Obsidian path changes
/// when destinations are switched on.
enum ExportProfile: Sendable {
    case obsidian
    case archive

    static func of(_ destination: NoteDestination) -> ExportProfile {
        destination.isArchive ? .archive : .obsidian
    }

    /// Does Skrift create and own a `Skrift/` folder inside the folder you picked? The
    /// archive already has a home — the destination folder IS the destination.
    var ownsHomeFolder: Bool { self == .obsidian }

    /// Group notes into a `YYYY-MM/` folder. The archive expects thousands of entries and a
    /// single flat folder stops being openable; a vault has its own organisation (PARA) and
    /// must not have a second one imposed on it.
    var usesMonthFolders: Bool { self == .archive }

    /// Name the file by timestamp rather than by the note's title. An archive entry is
    /// identified by when it was captured; a vault note is found by its name.
    var usesTimestampNames: Bool { self == .archive }

    /// Media beside the note sharing its basename, rather than in `Recordings/` / `Images/`.
    /// This is the other half of "shareable": the pair travels together.
    var assetsBesideNote: Bool { self == .archive }

    /// `![[name]]` (Obsidian) vs `![](name)` (portable, and still rendered by Obsidian).
    var usesWikiEmbeds: Bool { self == .obsidian }

    /// Weather, pressure, day period, daylight, steps, and the importance rating —
    /// personal-notes furniture with nothing to say in an archive entry.
    var keepsSensorFrontmatter: Bool { self == .obsidian }

    /// PLACE wiki-links in the body (`[[Hotel Du Vin]]`). People links are kept in BOTH
    /// profiles — Tuur's call, 2026-08-26, and a deliberate reversal of my privacy advice:
    /// the archive becomes a public website and he wants to credit his friends by name.
    /// Places carry no such intent, and a dangling place link on a website is just a
    /// broken link, so they degrade to plain text.
    var keepsPlaceLinks: Bool { self == .obsidian }

    /// The month folder for a note captured at `date`, or nil when this profile is flat.
    func monthFolder(for date: Date) -> String? {
        guard usesMonthFolders else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        let c = cal.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }

    /// The archive's filename stem: `2026-08-26-142312`. Local time on purpose — it is the
    /// moment HE captured it, and an archive browsed by a human should read in his day.
    static func timestampStem(for date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd-HHmmss"
        return f.string(from: date)
    }

    /// Render one image reference in this profile's syntax.
    func imageMarkdown(_ filename: String) -> String {
        usesWikiEmbeds ? "![[\(filename)]]" : "![](\(filename))"
    }
}
