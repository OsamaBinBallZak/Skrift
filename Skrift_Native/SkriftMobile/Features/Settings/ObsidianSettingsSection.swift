import SwiftUI
import UniformTypeIdentifiers

/// Settings → Obsidian: the FRONT DOOR the publish stack shipped without (2026-07-26).
/// `ObsidianVault.setVault` existed for a month with zero callers — no picker meant no
/// vault could ever be configured, so none of the publish code had ever run on a
/// device. This section is the missing entry: pick the folder (a security-scoped
/// bookmark, the `AudiobookImporter`/`MemoSaver` pattern), enable, and a manual
/// "Export now" that reports honestly per the engine's outcomes. Export is RATED-ONLY
/// with no option to change that — see the note by the Author field.
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

            if folderName != nil {
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
            Text(folderName == nil
                 ? "Pick the folder inside your vault where Skrift should put its notes — audio and photos land in subfolders beside them. Skrift only ever touches its own files."
                 : "Notes, audio and photos go into “\(folderName ?? "")”. A note you edit or move in Obsidian is left alone — Skrift never overwrites your version.")
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
            if summary.ineligible > 0 { bits.append("\(summary.ineligible) not eligible") }
            lastRun = bits.isEmpty ? "Nothing to export yet." : bits.joined(separator: " · ")
            running = false
        }
    }
}
