import SwiftUI

/// The tag CHIP editor. Reworked 2026-08-27 to the signed mock
/// `mocks/note-destination-tags.html` — Tuur: *"adding tags is just annoying"*.
///
/// Three things were wrong and are fixed here:
/// - **The keyboard opened before you had decided anything.** `.onAppear { inputFocused
///   = true }` meant the `.medium` detent was mostly keyboard, and the suggestions you
///   would rather TAP were pushed under it. Nothing focuses now until you tap the field.
/// - **Typing was the primary affordance and picking was the afterthought.** Suggestions
///   are above the fold; the type field is one row at the bottom.
/// - **The phone never read the vault.** The Mac has suggested REAL vault tags since
///   `VaultTagScanner` shipped; the phone suggested only tags already on its own notes,
///   even though it holds a bookmark to the vault for exactly this. Vault tags are merged
///   in and marked, so "pick, not retype" finally means the whole vocabulary.
///
/// Typing one of the four DESTINATION words is refused rather than becoming a tag — as a
/// tag it would sit beside the chip meaning the opposite thing (`NoteDestination`).
struct TagEditorSheet: View {
    @Bindable var memo: Memo
    /// Every live tag across the library, most-used first (suggestion source).
    let allTags: [String]
    var onChanged: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @FocusState private var inputFocused: Bool
    /// Tag names already in use in the picked vault — scanned off the main actor on open.
    @State private var vaultTags: [String] = []
    /// The refusal shown when a destination word is typed into the free field.
    @State private var refusal: String?

    /// Suggestions: YOUR tags first (most-used), then the vault's, minus what this note
    /// already has, prefix-filtered by what is being typed.
    private var suggestions: [String] {
        let typed = input.trimmingCharacters(in: .whitespaces).lowercased()
        var seen = Set(memo.tags.map { $0.lowercased() })
        var out: [String] = []
        for tag in allTags + vaultTags {
            let key = tag.lowercased()
            guard !seen.contains(key), typed.isEmpty || key.hasPrefix(typed) else { continue }
            seen.insert(key)
            out.append(tag)
        }
        return out
    }

    /// Is this suggestion one the VAULT already knows? Marked in the UI so "pick, not
    /// retype" can be trusted — a green-edged chip is a tag that already exists over there.
    private func isVaultTag(_ tag: String) -> Bool {
        !allTags.contains { $0.lowercased() == tag.lowercased() }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.skBg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        if !memo.tags.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionLabel("ON THIS NOTE")
                                FlowLayout(spacing: 8, lineSpacing: 8) {
                                    ForEach(memo.tags, id: \.self) { tag in
                                        Button { remove(tag) } label: {
                                            HStack(spacing: 5) {
                                                Text("#\(tag)")
                                                    .font(.system(size: 13, weight: .medium))
                                                Image(systemName: "xmark")
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(Color.skAccentText.opacity(0.7))
                                            }
                                            .foregroundStyle(Color.skAccentText)
                                            .padding(.horizontal, 10).padding(.vertical, 6)
                                            .background(Color.skAccentSoft, in: .capsule)
                                            .overlay(Capsule().strokeBorder(Color.skAccent.opacity(0.35), lineWidth: 1))
                                        }
                                        .accessibilityIdentifier("tag-chip-\(tag)")
                                        .accessibilityLabel("Remove tag \(tag)")
                                    }
                                }
                            }
                        }

                        if !suggestions.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionLabel("TAP TO ADD")
                                FlowLayout(spacing: 8, lineSpacing: 8) {
                                    ForEach(suggestions.prefix(40), id: \.self) { tag in
                                        Button { add([tag]) } label: {
                                            Text("#\(tag)")
                                                .font(.system(size: 13))
                                                .foregroundStyle(Color.skTextDim)
                                                .padding(.horizontal, 10).padding(.vertical, 6)
                                                .background(Color.white.opacity(0.05), in: .capsule)
                                                .overlay(Capsule().strokeBorder(
                                                    isVaultTag(tag) ? Color.skGreen.opacity(0.35) : Color.skBorder,
                                                    lineWidth: 1))
                                        }
                                        .accessibilityIdentifier("tag-suggestion-\(tag)")
                                    }
                                }
                                if vaultTags.contains(where: { isVaultTag($0) }) {
                                    Text("Green-edged tags already exist in your vault.")
                                        .font(.system(size: 11.5))
                                        .foregroundStyle(Color.skTextFaint)
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("ADD")
                            TextField("tag, tag, tag", text: $input)
                                .font(.system(size: 15))
                                .foregroundStyle(Color.skText)
                                .tint(.skAccent)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .submitLabel(.done)
                                .focused($inputFocused)
                                .onSubmit(addTyped)
                                .padding(.horizontal, 12).padding(.vertical, 10)
                                .background(Color.skElev, in: .rect(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle.sk(10).stroke(
                                    inputFocused ? Color.skAccent.opacity(0.45) : Color.skBorder, lineWidth: 1))
                                .accessibilityIdentifier("tag-input")
                            Text(refusal ?? "Separate multiple tags with commas.")
                                .font(.system(size: 11.5))
                                .foregroundStyle(refusal == nil ? Color.skTextFaint : Color.skRed)
                                .accessibilityIdentifier("tag-helper")
                        }

                    }
                    .padding(Theme.Space.margin)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .navigationTitle("Tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        addTyped()
                        dismiss()
                    }
                    .accessibilityIdentifier("tag-editor-done")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            // The vault scan is file IO — off the main actor, and only what the app itself
            // reads (PRIVACY: app code scanning the vault is fine; its contents never leave).
            guard vaultTags.isEmpty, let vault = ObsidianVault.resolveVault() else { return }
            let scanned = await Task.detached(priority: .utility) { () -> [String] in
                let scoped = vault.startAccessingSecurityScopedResource()
                defer { if scoped { vault.stopAccessingSecurityScopedResource() } }
                return VaultTagScanner.scan(root: VaultLayout.home(forPicked: vault))
            }.value
            vaultTags = scanned
        }
    }

    private func addTyped() {
        let split = Memo.splitTagInput(input)
        // A destination word is not a tag: it would sit beside the chip meaning the opposite
        // thing, and the whole point of a stored field is that a typo can't re-route a note.
        refusal = split.reserved.first.map(NoteDestination.reservedRefusal)
        input = split.reserved.isEmpty ? "" : input
        add(split.accepted)
    }

    private func add(_ incoming: [String]) {
        var added = false
        for t in incoming where !memo.tags.contains(t) {
            memo.tags.append(t)
            added = true
        }
        if added { memo.markEdited(); onChanged() }
    }

    private func remove(_ tag: String) {
        memo.tags.removeAll { $0 == tag }
        memo.markEdited()
        onChanged()
    }
}
