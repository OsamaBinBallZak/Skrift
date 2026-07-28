import Foundation
import SwiftData

/// The FILE-channel answer to "is this note rated?" — the ONE place the
/// `PipelineFile.significance` dialect (`Double?`) is resolved.
///
/// An explicit value answers directly (`litCount`): a synced row converges to
/// its memo's true value via `MemoCloudUpdate`, so a mirrored `0` is a real
/// "consent withdrawn", and the circles bind the row's value live. `nil` is
/// the ambiguous case — it means three different things in three populations,
/// resolved here once:
///
/// • a PROJECTION (`modelContext == nil` — `MemoNoteProjection` maps an
///   unrated memo's 0 to nil and is never inserted into a context): the
///   memo's truth was 0 → **unrated**.
/// • a local RECORDING (`isLocalRecording`): authored unrated on purpose —
///   capture is not judgment → **unrated**.
/// • a local IMPORT / legacy row: its authored `Memo` carries `MacMemoAuthor`'s
///   0.1 floor (adding a file IS a request to process it); the row itself just
///   never heard the number back → **rated**. Same nil-asymmetry
///   `MacCloudMetaSync.mirror` documents: a passive pass must never read nil
///   as 0.
extension NoteConsent {
    static func isRated(_ pf: PipelineFile) -> Bool {
        if let sig = pf.significance { return isRated(sig) }
        return pf.modelContext != nil && !pf.isLocalRecording
    }
}
