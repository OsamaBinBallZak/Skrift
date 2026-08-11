import SwiftUI
import UniformTypeIdentifiers

/// Settings → Obsidian.
///
/// **Two different jobs, split by what the device can actually do** (Tuur, 2026-08-11):
///
/// - **Picking the folder is for EVERY device, including the phone** — because the phone
///   wants to READ your vault ("we just want the phone to be able to read the vault, so
///   it's good to pick a folder, but that is about it"). The security-scoped bookmark is
///   the prerequisite for that, so the picker earns its place on iPhone even though
///   nothing there writes.
/// - **Exporting is only offered where the device can PROCESS a note** —
///   `PolishCenter.isAvailable`, the same gate the "Polish on this iPad" section uses.
///   Tuur: *"the phone can't even export anything to Obsidian, so it shouldn't even be
///   there. Only the iPad and the Mac can do that after they processed the note."* A
///   vault note is a POLISHED note; the phone captures, the Mac and iPad process, and
///   only what's been processed earns a place in the vault. Showing an Export button on
///   a device that can't produce one was a control that promised what it couldn't do.
///
/// (`ObsidianVault.setVault` had zero callers before 2026-07-26 — no picker meant no
/// vault could ever be configured, so none of the publish code had ever run on a device.)
struct ObsidianSettingsSection: View {
    @AppStorage("skrift.publish.obsidianEnabled") private var enabled = false
    /// The `author:` written into every note's frontmatter. Matching the Mac's
    /// Settings author matters: the SAME note exported by both devices must compile
    /// to the SAME bytes, or each device would see the other's file as "changed".
    @AppStorage("skrift.publish.author") private var author = ""

    @State private var pickingFolder = false
    @State private var folderName = ObsidianVault.displayName
    @State private var lastRun: String?
    @State private var running = false

    /// Can THIS device turn a memo into a polished note? If not, it has nothing to
    /// export, so the export controls don't appear at all.
    private var canProcess: Bool { PolishCenter.shared.isAvailable }

    var body: some View {
        Section {
            Button {
                pickingFolder = true
            } label: {
                HStack {
                    Label("Folder", systemImage: "folder")
                        .foregroundStyle(Color.skText)
                    Spacer()
                    Text(folderName ?? "Choose…")
                        .foregroundStyle(folderName == nil ? Color.skAccent : Color.skTextDim)
                }
            }
            .accessibilityIdentifier("obsidian-folder")

            if folderName != nil, canProcess {
                Toggle("Export to Obsidian", isOn: $enabled)
                    .accessibilityIdentifier("obsidian-enabled")
                if enabled {
                    // No "which notes" picker: export is RATED-ONLY, on every device
                    // (Tuur, 2026-07-26 — "cant export either"). An unrated note is
                    // one you haven't judged yet, and the vault is outward permanence;
                    // an "All notes" option would have contradicted that on the phone
                    // while the Mac refused. One rule, no setting to get wrong.
                    LabeledContent("Author") {
                        TextField("optional", text: $author)
                            .multilineTextAlignment(.trailing)
                            .autocorrectionDisabled()
                    }
                    Button {
                        exportNow()
                    } label: {
                        HStack {
                            Text(running ? "Exporting…" : "Export now")
                            Spacer()
                            if running { ProgressView().controlSize(.mini) }
                        }
                    }
                    .disabled(running)
                    .accessibilityIdentifier("obsidian-export-now")
                    if let lastRun {
                        Text(lastRun)
                            .font(.footnote)
                            .foregroundStyle(Color.skTextDim)
                    }
                }
            }
        } header: {
            Text("Obsidian")
        } footer: {
            Text(footerText)
        }
        .fileImporter(isPresented: $pickingFolder,
                      allowedContentTypes: [.folder]) { result in
            guard case .success(let url) = result else { return }
            do {
                try ObsidianVault.setVault(url)
                folderName = ObsidianVault.displayName
            } catch {
                lastRun = "Couldn't save the folder — pick it again."
            }
        }
    }

    /// Says what THIS device will actually do with the folder — never more.
    private var footerText: String {
        guard let folderName else {
            return canProcess
                ? "Pick the folder inside your vault where Skrift should put its notes — audio and photos land in subfolders beside them. Skrift only ever touches its own files."
                : "Pick your Skrift folder so this iPhone can read your vault. Notes are written to it by your Mac (and iPad) once they've been processed."
        }
        return canProcess
            ? "Notes, audio and photos go into “\(folderName)”. A note you edit or move in Obsidian is left alone — Skrift never overwrites your version."
            : "This iPhone reads “\(folderName)”; it doesn't write to it. Your Mac and iPad put notes there once they've processed them."
    }

    private func exportNow() {
        running = true
        lastRun = nil
        Task { @MainActor in
            let summary = PublishCoordinator.live(author: author).publishAll()
            var bits: [String] = []
            if summary.written > 0 { bits.append("\(summary.written) written") }
            if summary.skipped > 0 { bits.append("\(summary.skipped) already current") }
            if summary.protected > 0 { bits.append("\(summary.protected) edited in Obsidian — left alone") }
            if summary.filedAway > 0 { bits.append("\(summary.filedAway) filed away — left there") }
            if summary.blocked > 0 { bits.append("\(summary.blocked) blocked") }
            if summary.failed > 0 { bits.append("\(summary.failed) failed") }
            if summary.ineligible > 0 { bits.append("\(summary.ineligible) not processed yet") }
            lastRun = bits.isEmpty ? "Nothing to export yet." : bits.joined(separator: " · ")
            running = false
        }
    }
}
