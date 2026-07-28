import AVFoundation
import Foundation

/// The live-caption engine — the part of "words appear while you talk" that is the SAME on
/// every app: accumulate captured PCM, re-transcribe the live window in snapshots, rotate it
/// into COMMITTED chunks that never change again, and pace the caller's poll off measured
/// cost so slow hardware slows down instead of melting.
///
/// Extracted verbatim from the phone's `TranscriptionService` streaming section (2026-07-28,
/// for the Mac's live-recording surface — mock `mocks/mac-live-transcription.html` m2). That
/// code is the survivor of the phone's freeze-spiral rounds, and every rule in here is a scar:
/// the committed/volatile boundary is REAL (rotated chunks never re-transcribe — the caption's
/// solid-vs-volatile colouring lied until it was; 2026-06-10 device finding), the pacing is
/// measured-cost-driven (a fixed cadence ran an A15 flat out → heat → throttle → frozen UI),
/// and the early rotation bounds per-poll inference on old/hot hardware. On an M4 the same
/// rules simply settle near their floors — no platform tuning, by construction.
///
/// What is NOT here, on purpose: the model (an injected `Transcribe` closure — the owner keeps
/// its one loaded ASR manager and its own readiness rules), the logger (`DevLog` on the phone,
/// `os.Logger` on the Mac), and any notion of a microphone. The engine eats owned buffers and
/// emits strings.
///
/// The caption is DISPLAY + SEED, never the authoritative transcript — the one-shot pass over
/// the finished file remains the truth on both apps (the Mac's m2 surface narrows that pass to
/// the engine-owned tail once the user has edited, but that is the caller's policy, not ours).
actor LiveCaptionEngine {

    /// The one ASR call the engine makes: the merged live window in, raw text out. The owner
    /// builds it over its loaded manager (fresh decoder state per call) and may swap/clear it
    /// mid-stream as the model loads and unloads — a `nil` transcriber pauses captions without
    /// dropping audio, exactly like the phone's `guard let asr`.
    typealias Transcribe = @Sendable (AVAudioPCMBuffer) async throws -> String

    /// Committing the live window bounds live-buffer memory on long recordings — and, on the
    /// Mac's m2 surface, sets how fast text SETTLES (settled = editable = white). The phone
    /// keeps the 25 s it was tuned with (a caption strip doesn't care, and rotation costs a
    /// re-transcribe of the window — dear on an A15). The Mac passes ~7 s: Tuur's first live
    /// take, 2026-07-28 — "it seems to write a whole paragraph until it turns white … works
    /// way less clear than the Apple one" — and an M4 re-transcribes a 7 s window in well
    /// under a second, so sentence-sized settling is affordable there.
    static let defaultRotationInterval: TimeInterval = 25
    let rotationInterval: TimeInterval
    /// Hard ceiling on the live buffer (≈90 s at 48 kHz). `rotateIfNeeded` normally trims at
    /// 25 s, but it bails when no transcriber is set — so this cap (enforced in `feed`,
    /// model-independent) stops the buffer running away while a model is downloading/loading.
    static let maxStreamFrames: AVAudioFrameCount = 48_000 * 90

    private let log: @Sendable (String) -> Void

    private var transcribe: Transcribe?
    private var streamBuffers: [AVAudioPCMBuffer] = []
    private var committedChunks: [String] = []
    private var streamStartedAt: Date?
    private var lastRotationAt: Date?
    private var rotating = false
    private var snapshotRunning = false
    private var streaming = false
    /// Cost of the most recent live-window snapshot on THIS device right now — drives the
    /// caller's poll pacing and the early rotation.
    private var lastSnapshotCost: TimeInterval = 0

    init(rotationInterval: TimeInterval = LiveCaptionEngine.defaultRotationInterval,
         log: @escaping @Sendable (String) -> Void = { _ in }) {
        self.rotationInterval = rotationInterval
        self.log = log
    }

    // MARK: - Session

    /// Begin a live session: clear prior state. The owner sets the transcriber separately,
    /// once (and whenever) its model is actually ready.
    func begin() {
        streamBuffers.removeAll(keepingCapacity: true)
        committedChunks.removeAll()
        streamStartedAt = Date()
        lastRotationAt = nil
        rotating = false
        streaming = true
        lastSnapshotCost = 0
        transcribe = nil
    }

    /// The model became ready (or went away). Safe mid-stream in either direction.
    func setTranscriber(_ t: Transcribe?) { transcribe = t }

    /// Append a captured buffer. The caller hands off an **owned** copy — capture taps reuse
    /// their backing storage under us.
    func feed(_ ownedBuffer: AVAudioPCMBuffer) {
        guard streaming else { return }
        streamBuffers.append(ownedBuffer)
        // Safety net: if rotation isn't trimming yet (no transcriber), drop the oldest
        // buffers so memory can't run away. The audio file on disk still has everything —
        // only the live-caption prefix is sacrificed, which is empty anyway without a model.
        var total = streamBuffers.reduce(AVAudioFrameCount(0)) { $0 + $1.frameLength }
        while total > Self.maxStreamFrames, streamBuffers.count > 1 {
            total -= streamBuffers.removeFirst().frameLength
        }
    }

    /// Drop all live state (stop/cancel).
    func end() {
        streamBuffers.removeAll(keepingCapacity: false)
        committedChunks.removeAll(keepingCapacity: false)
        streamStartedAt = nil
        lastRotationAt = nil
        rotating = false
        streaming = false
        transcribe = nil
    }

    // MARK: - Caption

    /// Best-effort full transcript right now: committed chunks + a live re-transcribe of the
    /// accumulated buffer. Overlapping calls short-circuit.
    func caption() async -> String {
        await captionParts().full
    }

    /// The caption split at its REAL finalized boundary: `committed` = rotated chunks that
    /// will NEVER change again; everything after is the live chunk, re-transcribed wholesale
    /// each poll (volatile). This is the true signal solid-vs-volatile rendering needs — and
    /// on the Mac's m2 surface it is also the OWNERSHIP boundary: settled text belongs to the
    /// user, the volatile tail to the engine.
    func captionParts() async -> (full: String, committed: String) {
        await rotateIfNeeded()
        let committed = committedText()
        guard transcribe != nil, !streamBuffers.isEmpty else { return (committed, committed) }
        if snapshotRunning { return (committed, committed) }
        snapshotRunning = true
        defer { snapshotRunning = false }
        guard let merged = Self.concatenate(buffers: streamBuffers) else { return (committed, committed) }
        let windowSeconds = Double(merged.frameLength) / merged.format.sampleRate
        let started = Date()
        defer {
            lastSnapshotCost = Date().timeIntervalSince(started)
            log("live snapshot: \(String(format: "%.1f", windowSeconds))s window"
                + " → \(Int(lastSnapshotCost * 1000))ms")
        }
        do {
            guard let transcribe else { return (committed, committed) }
            let tail = try await transcribe(merged)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if tail.isEmpty { return (committed, committed) }
            let full = committed.isEmpty ? tail : committed + " " + tail
            return (full, committed)
        } catch {
            return (committed, committed)
        }
    }

    /// Stitched transcribe of the remaining buffer + committed chunks, then teardown.
    /// The authoritative transcript is still the one-shot pass over the finished file.
    func finish() async -> String {
        await finishParts().stitched
    }

    /// `finish`, split at the ownership boundary — for the Mac's m2 surface, where the user
    /// may have EDITED the settled text mid-take: `finalTail` is a final-quality transcribe of
    /// ONLY the un-rotated live window (the engine's own wet ink), so the caller can finalize
    /// the engine's region without touching a word the user owns. `stitched` remains the whole
    /// thing for callers that want it. Tears down either way.
    func finishParts() async -> (stitched: String, finalTail: String) {
        var finalSegment = ""
        if let transcribe, !streamBuffers.isEmpty,
           let merged = Self.concatenate(buffers: streamBuffers) {
            finalSegment = ((try? await transcribe(merged)) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let stitched = (committedChunks + [finalSegment]).filter { !$0.isEmpty }.joined(separator: " ")
        end()
        return (stitched, finalSegment)
    }

    private func committedText() -> String { committedChunks.joined(separator: " ") }

    /// Chunk rotation: transcribe the live buffer into a committed chunk and clear it — at
    /// the `rotationInterval` hard cap (bounds memory), or EARLY once snapshots have grown
    /// expensive for this device (bounds per-poll inference cost — see `shouldRotate`).
    private func rotateIfNeeded() async {
        guard !rotating, let transcribe, !streamBuffers.isEmpty else { return }
        let started = lastRotationAt ?? streamStartedAt ?? Date()
        let window = Date().timeIntervalSince(started)
        guard Self.shouldRotate(sinceRotation: window, lastSnapshotCost: lastSnapshotCost,
                                interval: rotationInterval) else { return }
        log("live rotate: committing \(String(format: "%.1f", window))s window"
            + " (last snapshot \(Int(lastSnapshotCost * 1000))ms)")
        rotating = true
        let snapshot = streamBuffers
        streamBuffers.removeAll(keepingCapacity: true)
        defer { rotating = false }
        guard let merged = Self.concatenate(buffers: snapshot) else { return }
        if let text = try? await transcribe(merged) {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { committedChunks.append(trimmed) }
        }
        lastRotationAt = Date()
        lastSnapshotCost = 0   // fresh (small) window — let the pacing re-measure
    }

    // MARK: - Pure rules (unit-tested; both apps' behavior hangs off these)

    /// Whether the live chunk should rotate into a committed chunk now. The hard cap bounds
    /// live-buffer memory; the early path commits a window whose snapshots have grown
    /// expensive (> 1.2 s) so per-poll cost stays bounded on old/hot hardware instead of
    /// climbing for the full 25 s.
    nonisolated static func shouldRotate(sinceRotation: TimeInterval,
                                         lastSnapshotCost: TimeInterval,
                                         interval: TimeInterval = defaultRotationInterval) -> Bool {
        if sinceRotation > interval { return true }
        // The early path only matters when it beats the cap (the phone's 25 s on old/hot
        // hardware); with a short cap it simply never fires first.
        if sinceRotation > 10, lastSnapshotCost > 1.2 { return true }
        return false
    }

    /// Next-poll delay after a snapshot that took `cost` seconds. ≥1.5× the cost bounds the
    /// live-caption ASR duty cycle to ~40% so the accelerator breathes between snapshots;
    /// thermal pressure raises the floor (a hot phone throttles into the freeze spiral
    /// otherwise); the 6 s cap keeps captions alive even at `.critical`. A cool M4's tiny
    /// costs settle this at the 0.6 s floor with no Mac-specific case.
    nonisolated static func pollDelay(afterSnapshotCost cost: TimeInterval,
                                      thermal: ProcessInfo.ThermalState) -> TimeInterval {
        let paced = min(max(0.6, cost * 1.5), 6)
        switch thermal {
        case .serious:  return max(paced, 2.5)
        case .critical: return max(paced, 6)
        default:        return paced
        }
    }

    // MARK: - Buffer helpers (ported from Shhhcribble TextEngine via the phone)

    static func copyBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let dst = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return nil }
        dst.frameLength = buffer.frameLength
        let channels = Int(buffer.format.channelCount)
        let frames = Int(buffer.frameLength)
        if let src = buffer.floatChannelData, let out = dst.floatChannelData {
            for ch in 0..<channels { memcpy(out[ch], src[ch], frames * MemoryLayout<Float>.size) }
        }
        return dst
    }

    static func concatenate(buffers: [AVAudioPCMBuffer]) -> AVAudioPCMBuffer? {
        guard let first = buffers.first else { return nil }
        let format = first.format
        let total = buffers.reduce(AVAudioFrameCount(0)) { $0 + $1.frameLength }
        guard total > 0, let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: total) else { return nil }
        out.frameLength = total
        let channels = Int(format.channelCount)
        var offset = 0
        for buf in buffers {
            let frames = Int(buf.frameLength)
            if let src = buf.floatChannelData, let dst = out.floatChannelData {
                for ch in 0..<channels { memcpy(dst[ch] + offset, src[ch], frames * MemoryLayout<Float>.size) }
            }
            offset += frames
        }
        return out
    }
}
