import Foundation
import SwiftData

/// An UNRATED memo, projected into the type the note view already renders.
///
/// **Why this exists.** The RATING is what pipelines a memo (`MemoCloudIngest`
/// gates on `significance > 0`), so an unrated `Memo` has no `PipelineFile` — and
/// `NoteDisplayView`/`NoteProperties`/`NoteBody` are all typed to one. The first two
/// attempts at "open an unrated note" answered that by building a SECOND renderer
/// that imitated the note anatomy; Tuur rejected both ("make an unrated note
/// identical to other notes"), and rightly — a copy drifts the moment either side
/// changes.
///
/// So: no second renderer, and no new view-model either. `PipelineFile` already IS
/// the shape the note view reads, so the memo is projected INTO one that is
/// **never inserted into the pipeline store**. The note view cannot tell the
/// difference — an unrated note IS a normal note — while nothing enters the queue,
/// so "the rating IS the flag" holds by construction rather than by policing.
///
/// **Deliberately faithful, not improved.** The projection maps the memo through
/// `MemoCloudIngest.metadataJSON` — the exact blob a real ingest would have written —
/// so the chips row, the capture blocks and the book-quote styling derive through the
/// same accessors a pipelined note uses. Where that blob has a *bug* (it writes
/// `duration` as a Double while `PipelineFile.durationSeconds` parses an HMS string,
/// so no synced note shows a duration chip) the projection inherits the bug on
/// purpose: matching what a normal note ACTUALLY does today is the whole point, and
/// a projection that quietly did better would read as a difference.
enum MemoNoteProjection {

    /// Build the transient `PipelineFile` for `memo`. Never inserted into a
    /// `ModelContext` — it is a view-model that happens to already have a type.
    /// `id` is the memo UUID (the contract spine), which is also what lets the
    /// existing Mac→phone write-back resolve the memo from it
    /// (`MacCloudWriteBack.memoID(for:)`).
    static func file(for memo: Memo) -> PipelineFile {
        let kind = SourceKind.of(memo)
        let pf = PipelineFile(id: memo.id.uuidString,
                              filename: memo.audioFilename,
                              path: "",          // no local media: the audio is a MemoAsset blob,
                                                 // never materialised until the memo is ingested.
                                                 // Keeps `showsTransport` false — an unrated note
                                                 // docks no player because there is nothing to play.
                              size: 0,
                              sourceType: sourceType(for: kind),
                              uploadedAt: memo.recordedAt)
        if kind == .video { pf.mediaSource = "video" }
        pf.transcript = memo.transcript
        pf.enhancedTitle = memo.title
        pf.tags = memo.tags
        // `significance` is OPTIONAL on PipelineFile and 0-means-unrated on Memo — an
        // unrated note must arrive at the circles as "nothing picked", not as a hard 0.
        pf.significance = memo.significance > 0 ? memo.significance : nil
        pf.locked = memo.locked
        pf.remindAt = memo.remindAt
        pf.imageOCRText = MemoCloudIngest.ocrText(for: memo)
        // The SAME blob a real ingest writes → place/weather/daypart chips, the capture
        // banner + shared-content block, and the audiobook quote card all derive through
        // the identical accessors a pipelined note uses.
        pf.audioMetadataJSON = MemoCloudIngest.metadataJSON(for: memo)
        // Only the transcribe step can be truthfully claimed (the phone did it). The rest
        // are pending because they genuinely haven't run — which is also what keeps the
        // title chooser away (it needs a `titleSuggested` the Mac hasn't produced).
        pf.transcribeStatus = memo.transcriptStatus == .done ? .done : .pending
        return pf
    }

    /// `SourceKind` → the coarse `PipelineFile.sourceType` the note view branches on.
    /// A video and an audiobook quote are both audio; the finer distinction rides
    /// `mediaSource` / the metadata blob, exactly as it does on an ingested row.
    private static func sourceType(for kind: SourceKind) -> SourceType {
        switch kind {
        case .appleNote: return .note
        case .captureURL, .captureImage, .captureText, .captureFile, .captureOther: return .capture
        case .voiceMemo, .video, .audiobookQuote: return .audio
        }
    }

    /// Push every field the note view can edit back onto the `Memo`, which is the real
    /// record. Returns true when something actually changed (so the caller only saves
    /// on a real edit).
    ///
    /// Title and transcript go STRAIGHT onto the memo rather than through
    /// `MacCloudEditSync` — that carrier writes a `MemoEnhancement`, i.e. "the Mac
    /// polished this", which would be a lie about a note the Mac has never processed.
    /// Tags and significance are written here TOO, even though `NoteProperties` also
    /// mirrors them via `MacCloudMetaSync`: that mirror is gated on
    /// `cloudKitMacSyncEnabled`, and an edit to an open note must land on the memo
    /// whether or not sync happens to be on. Both paths compare before writing, so the
    /// overlap is a no-op rather than a fight.
    @discardableResult
    static func writeBack(_ pf: PipelineFile, to memo: Memo) -> Bool {
        var changed = false
        let title = pf.enhancedTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let newTitle = (title?.isEmpty ?? true) ? nil : title
        if memo.title != newTitle { memo.title = newTitle; changed = true }
        // The body binding writes to `transcript` on a projection (there is no
        // `sanitised`/`enhancedCopyedit` to take precedence), so this is the raw
        // transcript — the phone's own field. A hand-edit is exactly what
        // `transcriptUserEdited` means, and it lifts the note over the trust gate
        // the same way an edit on the phone does.
        if let body = pf.transcript, body != memo.transcript {
            memo.transcript = body
            memo.transcriptUserEdited = true
            changed = true
        }
        if memo.tags != pf.tags { memo.tags = pf.tags; changed = true }
        // Rating an unrated note through the ordinary circles is what pipelines it —
        // the flag stays the rating, stated by the user on the note itself.
        if let sig = pf.significance, sig > 0, memo.significance != sig {
            memo.significance = sig
            changed = true
        }
        if changed { memo.editedAt = Date() }
        return changed
    }
}
