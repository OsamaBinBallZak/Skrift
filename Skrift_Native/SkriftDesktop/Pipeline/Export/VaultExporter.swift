import Foundation
import os

/// Writes a compiled note to the Obsidian vault: the `.md` (frontmatter + body) at
/// the vault root, the original audio into the audio subfolder, and any captured
/// images into the attachments subfolder. Pure (Compiler + FileManager), so the
/// coordinator and the `-runfile` harness share it and it host-tests.
enum VaultExporter {
    struct Result: Equatable {
        /// What the shared engine decided — created/updated/unchanged, or WHY it
        /// refused (edited in the vault / filed away / legacy / foreign). Callers
        /// message from this instead of pretending every non-throw was a write.
        let outcome: VaultWriteOutcome
        let markdownURL: URL
        let audioURL: URL?
        let imageCount: Int
    }

    enum ExportError: LocalizedError {
        case noVault
        case lockedNote
        var errorDescription: String? {
            switch self {
            case .noVault: return "Set your Obsidian vault path in Settings first."
            case .lockedNote: return "This note is locked — locked notes stay inside Skrift (the vault is plain text). Unlock it on any device to export."
            }
        }
    }

    /// Export through the SHARED engine (`VaultWriter`, 2026-07-26): this file keeps
    /// only the Mac's asset sourcing (working-folder images, Apple-Note attachments);
    /// naming, the stamp, the edit guard, collision handling, atomic+coordinated
    /// writes and the ledger are the one cross-app implementation. The engine is
    /// asked FIRST (`assess`) so a refused note copies zero images and touches
    /// nothing — the old path wrote `<title>.md` unconditionally over whatever was
    /// there, with a bare non-atomic write, into a folder that lives in iCloud.
    @discardableResult
    static func export(_ pf: PipelineFile, settings: AppSettings) throws -> Result {
        // The lock gate: a locked note NEVER reaches the plaintext vault — the same
        // promise the phone's PublishCoordinator makes. (Locking never deletes an
        // already-exported file; the phone's lock flow says so to the user.)
        guard !pf.locked else { throw ExportError.lockedNote }
        let vault = settings.noteFolder.trimmingCharacters(in: .whitespaces)
        guard !vault.isEmpty else { throw ExportError.noVault }
        // Resolve the PICK into the folder we own. Point at `0 Inbox` and Skrift makes
        // `0 Inbox/Skrift`; point at `0 Inbox/Skrift` and it uses that, unchanged — both of
        // Tuur's habits land in the same place and nothing in the vault moves.
        let vaultURL = VaultLayout.home(forPicked: URL(fileURLWithPath: vault))
        try FileManager.default.createDirectory(at: vaultURL, withIntermediateDirectories: true)

        // A synced memo's row id IS the memo UUID; demo/synthetic rows get a stable
        // derived one so the stamp works for every row, forever.
        let id = UUID(uuidString: pf.id) ?? VaultIdentity.uuid(for: pf.id)
        // Folder names are the engine's now, not settings — see VaultWriter.
        let writer = VaultWriter(root: vaultURL, ledger: .default(for: vaultURL))

        // Phase 1 — may we write, and where? A refusal costs nothing: no compile
        // output lands, no image is copied, the vault is untouched.
        let relPath: String
        switch writer.assess(id: id, title: pf.enhancedTitle, filenameFallback: pf.filename) {
        case .refused(let outcome):
            return Result(outcome: outcome,
                          markdownURL: vaultURL.appendingPathComponent(outcome.relativePath),
                          audioURL: nil, imageCount: 0)
        case .proceed(let rel, _):
            relPath = rel
        }
        // The stem the ENGINE chose — sticky across retitles, collision-resolved —
        // names the attachments too, so embeds always match their files.
        let safe = ((relPath as NSString).lastPathComponent as NSString).deletingPathExtension

        // Filter `people:` to actual persons at export — the vault output is the one that
        // must be clean (no place/embed links leaking into the people graph). Memo-link
        // stems consult THIS vault's ledger first, so links follow the files actually
        // written (a retitled target keeps its sticky filename).
        let markdown = Compiler.compile(file: pf, author: settings.authorName,
                                        knownPeople: NamesStore.shared.livePeople(),
                                        linkLedger: writer.ledger)

        // Snap mid-sentence photo markers to their sentence end (shared with both
        // app bodies) so the exported `![[…]]` embed drops beneath the whole sentence,
        // exactly as the note reads on screen — only `[[img_NNN]]` moves; names,
        // frontmatter and existing embeds pass through untouched.
        // Convert [[img_NNN]] markers → ![[<safe>_NNN.ext]] Obsidian embeds and copy
        // the matched images into the attachments subfolder. The working folder (which holds
        // `images/`) is the ONE `pf.workingFolder` derivation (captures → pf.path; audio/notes
        // → its parent).
        var finalMarkdown = BodyTransform.snappedImageBody(markdown)
        var imageCount = 0
        let imagesDir = pf.workingFolder?.appendingPathComponent("images")
        if let imagesDir, FileManager.default.fileExists(atPath: imagesDir.path) {
            let attDir = vaultURL.appendingPathComponent(VaultLayout.images, isDirectory: true)
            // Share-Wave-2 image captures inline photos as `[[img_NNN]]` markers in the
            // annotation (same contract as recorded memos) → convert + copy exactly like
            // memos. Legacy marker-less captures keep the copy-under-original-name path
            // (their pinned `![[filename]]` embed references the original name).
            if pf.sourceType == .capture, !finalMarkdown.contains("[[img_") {
                (finalMarkdown, imageCount) = copyCaptureFolderImages(imagesDir: imagesDir, into: attDir, markdown: finalMarkdown)
            } else {
                (finalMarkdown, imageCount) = convertImageMarkers(finalMarkdown, imagesDir: imagesDir, safe: safe, into: attDir)
            }
        }

        // Apple-Note attachments: copy the note's `Attachments/` into the vault
        // attachments folder and convert `(Attachments/<name>)` refs → Obsidian
        // `![[<name>]]` embeds (robust to the renamed files' spaces).
        if pf.sourceType == .note, !pf.path.isEmpty {
            let attSrc = URL(fileURLWithPath: pf.path).deletingLastPathComponent()
                .appendingPathComponent("Attachments", isDirectory: true)
            if FileManager.default.fileExists(atPath: attSrc.path) {
                let attDir = vaultURL.appendingPathComponent(VaultLayout.images, isDirectory: true)
                let (rewritten, copied) = convertNoteAttachments(finalMarkdown, attachmentsSrc: attSrc, into: attDir)
                finalMarkdown = rewritten
                imageCount += copied
            }
        }

        // Original audio rides the engine's asset lane (per-note opt-out honored).
        var audio: VaultAsset?
        if pf.includeAudioInExport, pf.sourceType == .audio,
           !pf.path.isEmpty, FileManager.default.fileExists(atPath: pf.path) {
            let ext = URL(fileURLWithPath: pf.path).pathExtension
            audio = VaultAsset(name: safe + "." + (ext.isEmpty ? "m4a" : ext),
                               source: .file(URL(fileURLWithPath: pf.path)))
        }

        // Phase 2 — stamp + atomic coordinated write (or skip everything when the
        // content is already current: no mtime churn for iCloud to chew on).
        let r = try writer.commit(markdown: finalMarkdown, id: id, relativePath: relPath, audio: audio)
        return Result(outcome: r.outcome, markdownURL: r.markdownURL,
                      audioURL: r.audioURL, imageCount: imageCount)
    }

    /// The exported note's filename stem — `enhancedTitle` (else the file stem), sanitized
    /// for Obsidian. ONE derivation, used by the export write AND the memo-link resolver
    /// (`[[memo:UUID|Title]]` → `[[<stem>|Title]]`), so links always match the real file.
    ///
    /// Obsidian forbids * " \ / < > : | ? in note names (cross-platform sync)
    /// and # ^ [ ] break its link syntax. Path separators become "-" (keeps
    /// word boundaries); the rest are stripped, then doubled spaces collapsed
    /// — Gemma loves "Title: Subtitle", which must not become "Title- Subtitle".
    static func noteStem(_ pf: PipelineFile) -> String {
        noteStem(title: pf.enhancedTitle, filename: pf.filename)
    }

    static func noteStem(title: String?, filename: String) -> String {
        // The one derivation moved to the SHARED `VaultName` (both apps name files
        // identically now); this wrapper keeps the Mac's call sites + tests stable.
        VaultName.stem(title: title, filename: filename)
    }

    /// Replace `[[img_NNN]]` markers with `![[<safe>_NNN.ext]]` Obsidian embeds,
    /// copying the matched image (by `img_NNN`/`_NNN.` name, else the NNN-th file)
    /// into `attDir` under the new name. Returns the rewritten markdown + copy count.
    static func convertImageMarkers(_ markdown: String, imagesDir: URL, safe: String, into attDir: URL) -> (String, Int) {
        let fm = FileManager.default
        let files = ((try? fm.contentsOfDirectory(at: imagesDir, includingPropertiesForKeys: nil)) ?? [])
            .filter { !$0.lastPathComponent.hasPrefix(".") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        guard !files.isEmpty, let rx = try? NSRegularExpression(pattern: "\\[\\[img_(\\d{3})\\]\\]") else {
            return (markdown, 0)
        }
        let ns = markdown as NSString
        var replacements: [(NSRange, String)] = []
        var copied = 0
        for m in rx.matches(in: markdown, range: NSRange(location: 0, length: ns.length)) {
            let nnn = ns.substring(with: m.range(at: 1))
            let idx = (Int(nnn) ?? 1) - 1
            let file = files.first { $0.lastPathComponent.contains("_\(nnn).") || $0.lastPathComponent.hasPrefix("img_\(nnn)") }
                ?? ((0..<files.count).contains(idx) ? files[idx] : nil)
            guard let file else { continue }
            let ext = file.pathExtension.isEmpty ? "jpg" : file.pathExtension
            let newName = "\(safe)_\(nnn).\(ext)"
            try? fm.createDirectory(at: attDir, withIntermediateDirectories: true)
            let dest = attDir.appendingPathComponent(newName)
            try? fm.removeItem(at: dest)
            if loggedCopy(fm, from: file, to: dest) { copied += 1 }
            replacements.append((m.range, "![[\(newName)]]"))
        }
        var out = markdown
        for (range, repl) in replacements.sorted(by: { $0.0.location > $1.0.location }) {
            out = (out as NSString).replacingCharacters(in: range, with: repl)
        }
        return (out, copied)
    }

    /// One attachment copy with the failure LOGGED — a `try?` here made a missing
    /// attachment indistinguishable from success (the embed got written either way).
    private static func loggedCopy(_ fm: FileManager, from src: URL, to dest: URL) -> Bool {
        do { try fm.copyItem(at: src, to: dest); return true }
        catch {
            Logger(subsystem: "com.skrift.desktop", category: "export")
                .error("attachment copy FAILED \(src.lastPathComponent, privacy: .public) — embed will dangle: \(error)")
            return false
        }
    }

    /// LEGACY (pre-Wave-2) captures: copy images from the capture's `images/` folder to
    /// the vault attachments folder under their original names — no `[[img_NNN]]` markers
    /// in the body, the Compiler emitted a pinned `![[filename]]` embed instead. Wave-2
    /// captures carry markers and go through `convertImageMarkers` like memos.
    static func copyCaptureFolderImages(imagesDir: URL, into attDir: URL, markdown: String) -> (String, Int) {
        let fm = FileManager.default
        let files = ((try? fm.contentsOfDirectory(at: imagesDir, includingPropertiesForKeys: nil)) ?? [])
            .filter { !$0.lastPathComponent.hasPrefix(".") }
        guard !files.isEmpty else { return (markdown, 0) }
        try? fm.createDirectory(at: attDir, withIntermediateDirectories: true)
        var copied = 0
        for file in files {
            let dest = attDir.appendingPathComponent(file.lastPathComponent)
            try? fm.removeItem(at: dest)
            if loggedCopy(fm, from: file, to: dest) { copied += 1 }
        }
        return (markdown, copied)
    }

    /// Copy an Apple Note's `Attachments/` files referenced as `![alt](Attachments/x)`
    /// or `[alt](Attachments/x)` into `attDir`, and convert the refs to Obsidian
    /// embeds/links (`![[x]]` / `[[x]]`). Robust to spaces in the renamed files (the
    /// wikilink form sidesteps markdown URL escaping). Returns rewritten md + copies.
    static func convertNoteAttachments(_ markdown: String, attachmentsSrc: URL, into attDir: URL) -> (String, Int) {
        let fm = FileManager.default
        guard let rx = try? NSRegularExpression(pattern: "(!?)\\[[^\\]]*\\]\\(Attachments/([^)]+)\\)") else {
            return (markdown, 0)
        }
        let ns = markdown as NSString
        var replacements: [(NSRange, String)] = []
        var copied = 0
        for m in rx.matches(in: markdown, range: NSRange(location: 0, length: ns.length)) {
            let bang = ns.substring(with: m.range(at: 1))
            let raw = ns.substring(with: m.range(at: 2))
            let name = raw.removingPercentEncoding ?? raw
            let src = attachmentsSrc.appendingPathComponent(name)
            guard fm.fileExists(atPath: src.path) else { continue }
            try? fm.createDirectory(at: attDir, withIntermediateDirectories: true)
            let dest = attDir.appendingPathComponent(name)
            try? fm.removeItem(at: dest)
            if loggedCopy(fm, from: src, to: dest) { copied += 1 }
            replacements.append((m.range, "\(bang)[[\(name)]]"))
        }
        var out = markdown
        for (range, repl) in replacements.sorted(by: { $0.0.location > $1.0.location }) {
            out = (out as NSString).replacingCharacters(in: range, with: repl)
        }
        return (out, copied)
    }
}
