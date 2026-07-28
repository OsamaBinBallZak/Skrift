import Foundation

/// The Mac's live-take finalize math — pure so the ownership-fork composition
/// (`LiveRecordingSession.stop()`, brief §5) can be pinned without a recorder, a model, or
/// SwiftData.
enum LiveRecordingFinalize {
    /// Join a settled piece with a tail piece, single space between them, both sides
    /// trimmed. Used for the EDITED take's final transcript (`settledText` +
    /// `LiveCaptionEngine.finishParts().finalTail`) and, reused for the same shape, the
    /// NOT-edited take's live-text seed (`settledText` + `wetText`) — both are "what's
    /// settled" plus "what's still wet," joined the same way.
    static func transcript(settledText: String, finalTail: String) -> String {
        let a = settledText.trimmingCharacters(in: .whitespacesAndNewlines)
        let b = finalTail.trimmingCharacters(in: .whitespacesAndNewlines)
        if a.isEmpty { return b }
        if b.isEmpty { return a }
        return a + " " + b
    }

    /// Whether a `MacRecorder.start()`/`stop()` outcome is a refusal the session should show
    /// as `.failed`, and which one. Pure mirror of `LiveRecordingSession.applyRecorderFailure`
    /// — the session itself isn't reachable from the host-less test target (its `init` needs
    /// `ProcessingCoordinator`, `Features/Shell`-only), so this is what pins the start/stop →
    /// phase mapping directly: `MacRecorder.State`/`Refusal` are already host-less testable
    /// (`Engines/MacRecorder.swift` is pulled into `SkriftDesktopTests` file-by-file).
    static func refusal(after state: MacRecorder.State) -> MacRecorder.Refusal? {
        guard case .failed(let refusal) = state else { return nil }
        return refusal
    }
}
