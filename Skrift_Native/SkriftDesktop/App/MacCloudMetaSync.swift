import Foundation
import SwiftData
import os

/// Mac→phone metadata write-back — the second half of "widen the narrow Mac→phone channel".
/// The enhancement carrier (`MacCloudWriteBack`) only ever carried body/title/summary, so tags
/// and importance edited on the Mac never reached the phone (and were frozen at first ingest the
/// other way). Both are plain `Memo` fields that already sync, so — exactly like delete-sync —
/// the Mac just writes them onto the synced `Memo`, and the phone reflects them.
///
/// App-only + gated like the reconcile loop (`cloudKitMacSyncEnabled` + a container); a no-op
/// otherwise. Writes each file's CURRENT `tags`/`significance` (set moments earlier by the review
/// UI) onto its memo. No `lastEditedAt` bump — these are synced fields on their own, and NOT
/// bumping it keeps the reconciler's text-reflect echo-quiet. `MemoCloudUpdate` reflects the phone
/// direction with a plain value compare, so a Mac write converges it (no clobber loop).
@MainActor
enum MacCloudMetaSync {
    private static let log = Logger(subsystem: "com.skrift.desktop", category: "cloudkit")

    /// Mirror each file's tags + importance onto its synced `Memo`. Safe for any files — non-synced
    /// / non-memo rows are skipped, and a memo already at the same values isn't churned.
    static func mirror(_ files: [PipelineFile]) {
        guard SettingsStore.shared.load().cloudKitMacSyncEnabled,
              let container = MemoCloudStore.container else { return }
        let ctx = container.mainContext
        var wrote = false
        for pf in files {
            guard let memoID = MacCloudWriteBack.memoID(for: pf),
                  let memo = (try? ctx.fetch(
                      FetchDescriptor<Memo>(predicate: #Predicate { $0.id == memoID })))?.first else { continue }
            if memo.tags != pf.tags { memo.tags = pf.tags; wrote = true }
            // A nil here stays SKIPPED on purpose. This is a passive "mirror current
            // values" pass that also runs on tag edits, and `nil` is ambiguous on a
            // `PipelineFile`: it means "cleared" OR "never rated". A Mac-local import
            // legitimately sits at nil while its authored `Memo` carries the 0.1 floor
            // (`MacMemoAuthor`), so treating nil as 0 here would silently un-rate it on
            // the next tag edit. Clearing is an EVENT — see `setRating`.
            if let sig = pf.significance, memo.significance != sig { memo.significance = sig; wrote = true }
        }
        if wrote {
            do { try ctx.save() }
            catch { log.error("meta-sync write failed: \(String(describing: error), privacy: .public)") }
        }
    }

    /// The user just set — or CLEARED — this note's rating on the Mac. Unlike `mirror`,
    /// this is driven by an actual click on the circles, so a nil is unambiguous: it's
    /// a re-tap clearing the rating, and `Memo.significance` says that with 0.
    ///
    /// Un-rating used to go nowhere at all (`mirror`'s `if let` dropped it), so a
    /// rating could be given but never taken back — Tuur, 2026-07-26: *"when i removed
    /// it it did not go grey again."*
    static func setRating(_ value: Double?, for pf: PipelineFile) {
        guard SettingsStore.shared.load().cloudKitMacSyncEnabled,
              let container = MemoCloudStore.container,
              let memoID = MacCloudWriteBack.memoID(for: pf) else { return }
        let ctx = container.mainContext
        guard let memo = (try? ctx.fetch(
            FetchDescriptor<Memo>(predicate: #Predicate { $0.id == memoID })))?.first else { return }
        let rating = value ?? 0
        guard memo.significance != rating else { return }
        memo.significance = rating
        do { try ctx.save() }
        catch { log.error("rating write failed: \(String(describing: error), privacy: .public)") }
    }

    /// The user CHOSE this note's title on the Mac — "Suggested", "From recording", or
    /// typed their own. Event-driven like `setRating`, and for the same reason: it must
    /// be distinguishable from the passive mirror.
    ///
    /// Why this exists (Tuur, 2026-07-27: *"I think that should just happen over all
    /// devices"*): the Mac only ever wrote its title to `MemoEnhancement.title` — the
    /// SUGGESTION carrier the phone deliberately does not auto-apply — while every
    /// device's list reads `Memo.title`. So picking a title on the Mac changed the Mac's
    /// list and nothing else, and the phone kept showing the transcript's first line.
    /// A generated suggestion still goes only to the enhancement; an explicit CHOICE is
    /// the note's title on every device.
    ///
    /// No `lastEditedAt` bump — `Memo.title` syncs on its own, and not bumping keeps the
    /// reconciler's text-reflect echo-quiet (same reasoning as `mirror`).
    static func setTitle(_ title: String?, for pf: PipelineFile) {
        guard SettingsStore.shared.load().cloudKitMacSyncEnabled,
              let container = MemoCloudStore.container,
              let memoID = MacCloudWriteBack.memoID(for: pf) else { return }
        let ctx = container.mainContext
        guard let memo = (try? ctx.fetch(
            FetchDescriptor<Memo>(predicate: #Predicate { $0.id == memoID })))?.first else { return }
        // Empty ⇒ nil: "no title", so every device falls back to its own first-line rule
        // rather than showing a blank heading.
        let clean = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let next = (clean?.isEmpty ?? true) ? nil : clean
        guard memo.title != next else { return }
        memo.title = next
        do { try ctx.save() }
        catch { log.error("title write failed: \(String(describing: error), privacy: .public)") }
    }
}
