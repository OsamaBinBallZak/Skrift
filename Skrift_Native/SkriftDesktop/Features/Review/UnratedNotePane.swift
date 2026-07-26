import SwiftUI
import SwiftData

/// An unrated memo, open in the detail pane as a NORMAL note.
///
/// This view renders nothing itself — that is the entire point. It resolves the memo,
/// projects it into the type the note view already reads (`MemoNoteProjection`), hands
/// it to the SAME `NoteDisplayView` every other note goes through, and mirrors edits
/// back onto the memo. Tuur, after two attempts that each built a look-alike renderer:
/// *"make an unrated note identical to other notes"* — so there is no second renderer
/// to drift, only a different source for the same one.
///
/// Rating it here is the ordinary significance control doing the ordinary thing: the
/// write flags the memo, the reconcile sweep ingests it into a real `PipelineFile`, and
/// `onRated` hands the pane over to that row. "The rating IS the flag" is untouched.
struct UnratedNotePane: View {
    let memoID: String
    var coordinator: ProcessingCoordinator
    /// The memo just got a rating → it is becoming a pipeline row; the shell should
    /// follow it there once the sweep lands.
    var onRated: (String) -> Void = { _ in }
    /// A memo-link chip inside the body pointed at another note.
    var onOpenMemo: (String) -> Void = { _ in }

    @State private var projection: PipelineFile?
    @State private var memo: Memo?
    @State private var loaded = false

    var body: some View {
        Group {
            if let projection {
                NoteDisplayView(file: projection, coordinator: coordinator,
                                capabilities: .unrated, onOpenMemo: onOpenMemo)
                    // The note view edits the projection; these put those edits on the
                    // memo, which is the real record. Cheap value compares — SwiftData
                    // models are Observable, so each fires only on an actual change.
                    .onChange(of: projection.enhancedTitle) { commit() }
                    .onChange(of: projection.transcript) { commit() }
                    .onChange(of: projection.tags) { commit() }
                    .onChange(of: projection.significance) { _, new in
                        commit()
                        // A rating pipelines the memo: kick the sweep that ingests it,
                        // then let the shell follow it to its new row.
                        if let value = new, value > 0 {
                            MemoCloudReconciler.reconcileSoon()
                            onRated(memoID)
                        }
                    }
            } else if loaded {
                missing
            } else {
                Color.clear
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
        .task(id: memoID) { load() }
        .accessibilityIdentifier("unrated-note-pane")
    }

    private var missing: some View {
        VStack(spacing: 6) {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 30)).foregroundStyle(Theme.textMuted.opacity(0.4))
            Text("This note may have been removed.")
                .font(.system(size: 14)).foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func load() {
        loaded = false
        projection = nil
        memo = nil
        defer { loaded = true }
        guard let uuid = UUID(uuidString: memoID),
              let ctx = MemoCloudStore.container?.mainContext,
              let found = try? ctx.fetch(FetchDescriptor<Memo>(predicate: #Predicate { $0.id == uuid })).first
        else { return }
        memo = found
        projection = MemoNoteProjection.file(for: found)
    }

    /// Mirror the projection's current values onto the memo and save.
    private func commit() {
        guard let projection, let memo,
              MemoNoteProjection.writeBack(projection, to: memo) else { return }
        try? MemoCloudStore.container?.mainContext.save()
    }
}
