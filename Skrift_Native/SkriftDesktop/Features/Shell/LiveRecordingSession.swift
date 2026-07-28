import Foundation
import SwiftData
import SwiftUI

/// One live take, end to end: the microphone (`MacRecorder`), the shared caption engine
/// (`LiveCaptionEngine` through the desktop `TranscriptionService`), the DRAFT the user
/// watches and may edit, and the stop-time finalize + arrival. The m2 surface
/// (`mocks/mac-live-transcription.html`) renders this and nothing else.
///
/// **This file is the FROZEN API both build lanes compile against** (conductor-shipped
/// skeleton, 2026-07-28): lane LIVE-ENGINE fills the implementation; lane LIVE-UI consumes
/// exactly this surface. Extend by addition only.
///
/// The ownership contract the whole design hangs on:
/// - `settledText` is the USER's. It starts as the engine's committed chunks (which never
///   re-transcribe — the phone's hard-won rotation boundary) and every keystroke edit lands
///   here. The engine may only APPEND to it (a newly committed chunk), never rewrite it.
/// - `wetText` is the ENGINE's — the volatile tail, re-transcribed each poll, display-only.
/// - The first user edit sets `everEdited`, which flips finalize authority: an unedited take
///   gets today's full-quality file pass (words swap in silently, phone-parity); an edited
///   take keeps every settled word verbatim and finalizes ONLY the engine's tail
///   (`LiveCaptionEngine.finishParts().finalTail`), landing with the Memo marked
///   user-edited (= trusted).
@MainActor
@Observable
final class LiveRecordingSession {

    enum Phase: Equatable {
        case idle
        /// Mic + engine coming up (fail-fast still applies — a refusal lands in `.failed`).
        case starting
        case live
        /// Stop pressed; the tail is being finalized + the take is arriving. Brief on an M4.
        /// Stop just stops (m4, trimmed per Tuur): no narration — the UI shows the note with
        /// the wet band until `idle`.
        case settling
        /// Start or capture refused — carries what to tell the user (same alert the Record
        /// button already shows).
        case failed(MacRecorder.Refusal)
    }

    private(set) var phase: Phase = .idle

    // ── the draft ─────────────────────────────────────────────
    /// The user's text. Bind the editor here; the setter records "the user touched this"
    /// (`everEdited`) whenever the change didn't come from the engine's own append.
    var settledText: String = ""
    /// The engine's volatile tail — rendered wet-ink, never editable.
    private(set) var wetText: String = ""
    /// The first mid-take edit flips finalize authority — see the class doc.
    private(set) var everEdited = false

    // ── transport passthrough (same meanings as MacRecorder's) ──
    private(set) var elapsed: TimeInterval = 0
    var elapsedLabel: String { RecordingCore.elapsedLabel(elapsed) }
    private(set) var meter = RecordingCore.Meter()

    /// After a completed stop: the created `PipelineFile` id, so the UI can select it.
    private(set) var noteID: String?

    init(coordinator: ProcessingCoordinator, context: ModelContext) {
        // Lane LIVE-ENGINE wires the real dependencies; the skeleton holds none.
    }

    /// Mic up, engine on, poll loop running. A refusal lands in `.failed` — the caller
    /// surfaces it exactly like a Record-button refusal today.
    func start() async {
        // Lane LIVE-ENGINE: MacRecorder.start() + buffer fan-out into the caption engine +
        // the self-pacing poll (LiveCaptionEngine.pollDelay) + absorb(parts:) into the draft.
    }

    /// Stop, finalize per the ownership contract, hand the take to `ArrivalPath.run`
    /// (asRecording: true, with hooks that respect `everEdited`), then `.idle`.
    func stop() async {
        // Lane LIVE-ENGINE.
    }

    /// Abandon the take: mic stopped, engine cleared, file deleted, draft discarded.
    func cancel() {
        // Lane LIVE-ENGINE.
    }
}
