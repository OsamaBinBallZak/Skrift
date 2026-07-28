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

    /// Pause-triggered settling (2026-07-28 research, `LANES-2026-07-28/RESEARCH_DICTATION.md`):
    /// production streaming stacks treat VAD/endpointing as the PRIMARY commit signal and the
    /// fixed window as the safety net — our timer-primary shape had it inverted (and the
    /// Shhhcribble ancestor's VAD speech-end trigger was dropped in the phone-era rewrite;
    /// this restores it, cheaply). When enabled, a detected pause rotates the chunk, so text
    /// settles at PHRASE boundaries the way Apple's dictation feels — the interval above only
    /// catches the person who never stops talking. Off by default: the phone keeps its
    /// thermally-tuned timer-only behavior byte-identical (every rotation costs a
    /// re-transcribe, and pauses fire far more often than 25 s).
    let pauseTriggered: Bool
    /// Voice level (RecordingCore's ×12 RMS scale) above which a buffer counts as speech —
    /// the MINIMUM. Real mics disagree wildly about silence: a built-in mic's room noise
    /// meters well under 0.1, but Tuur's USB desk mic never reads below ~0.24 (measured on
    /// a real take, 2026-07-28) — a fixed floor can't serve both, so the effective floor
    /// ADAPTS: `adaptiveVoiceFloor` rides a rolling minimum of the stream's own levels
    /// (the quietest thing this mic has produced lately IS its silence) and never drops
    /// below this constant. A wrong floor fails safe either way: too high and voice stops
    /// registering (silenceFor stays nil → ceiling-only, the old behavior); too low and
    /// pauses go unseen (also the old behavior) — never phrase confetti.
    static let voiceFloor: Float = 0.15
    /// How far above the mic's own silence a buffer must rise to count as speech. On the
    /// measured USB-mic take: noise 0.20–0.30, speech p50 0.40 → floor ≈ 0.32 finds exactly
    /// the speaker's 7 real ≥0.8s pauses and nothing mid-speech (the 0.8s hangover absorbs
    /// soft-speech dips that graze the floor).
    static let voiceFloorMargin: Float = 0.08
    /// Silence this long after voice = the phrase ended. Deepgram recommends ≥1s for
    /// utterance-end; phrase-level settling wants a touch tighter than that, and mid-sentence
    /// micro-pauses stay safely below it.
    static let pauseHangover: TimeInterval = 0.8
    /// Never pause-rotate a window shorter than this — tiny chunks churn the ASR for
    /// fragments and pollute `committedChunks` with confetti.
    static let minPauseWindow: TimeInterval = 2.0
    /// The last moment `feed` saw a buffer above `voiceFloor` — nil until voice happens.
    private var lastVoiceAt: Date?
    /// The most recent per-buffer levels (newest last), kept only while `pauseTriggered` —
    /// logged at rotate time so a real take can answer whether a "pause" was true silence
    /// (levels near the room floor, ~0.02–0.05) or soft speech dipping under `voiceFloor`
    /// (~0.08–0.14) — the ranked suspect for mid-sentence settling (backlog ROUND 10).
    private var recentLevels: [Float] = []
    private static let recentLevelCount = 16
    /// Rolling-minimum bookkeeping for the adaptive floor: two 5 s buckets, so the
    /// estimate always covers the last 5–10 s (long enough to include a real inter-phrase
    /// silence, short enough to follow gain drift). O(1) per buffer.
    private var bucketMin: Float = 1
    private var prevBucketMin: Float = 1
    private var bucketStartedAt: Date?
    private static let bucketSeconds: TimeInterval = 5
    /// The floor currently in force (logged per rotate — next take's evidence).
    private var currentVoiceFloor: Float = LiveCaptionEngine.voiceFloor
    /// Hard ceiling on the live buffer (≈90 s at 48 kHz). `rotateIfNeeded` normally trims at
    /// 25 s, but it bails when no transcriber is set — so this cap (enforced in `feed`,
    /// model-independent) stops the buffer running away while a model is downloading/loading.
    static let maxStreamFrames: AVAudioFrameCount = 48_000 * 90

    private let log: @Sendable (String) -> Void

    private var transcribe: Transcribe?
    private var streamBuffers: [AVAudioPCMBuffer] = []
    /// Committed chunks with the separator each one carries BEFORE its text ("" on the
    /// first). In pause mode a chunk that follows a pause-rotated, sentence-ending chunk
    /// joins with a paragraph break — see `chunkJoin`. Timer-only (the phone) every join is
    /// a single space, so `committedText()` stays byte-identical there.
    private var committedChunks: [(join: String, text: String)] = []
    /// The separator the NEXT committed chunk will carry — decided when a chunk lands
    /// (`chunkJoin` over its text + its rotation's trigger), consumed by the next append.
    /// An empty rotate in between (a silence-only window) must not disturb it: the boundary
    /// is still the last REAL chunk's.
    private var nextJoin = " "
    private var streamStartedAt: Date?
    private var lastRotationAt: Date?
    private var rotating = false
    private var snapshotRunning = false
    private var streaming = false
    /// Cost of the most recent live-window snapshot on THIS device right now — drives the
    /// caller's poll pacing and the early rotation.
    private var lastSnapshotCost: TimeInterval = 0

    init(rotationInterval: TimeInterval = LiveCaptionEngine.defaultRotationInterval,
         pauseTriggered: Bool = false,
         log: @escaping @Sendable (String) -> Void = { _ in }) {
        self.rotationInterval = rotationInterval
        self.pauseTriggered = pauseTriggered
        self.log = log
    }

    // MARK: - Session

    /// Begin a live session: clear prior state. The owner sets the transcriber separately,
    /// once (and whenever) its model is actually ready.
    func begin() {
        streamBuffers.removeAll(keepingCapacity: true)
        committedChunks.removeAll()
        nextJoin = " "
        streamStartedAt = Date()
        lastRotationAt = nil
        rotating = false
        streaming = true
        lastSnapshotCost = 0
        lastVoiceAt = nil
        recentLevels.removeAll(keepingCapacity: true)
        bucketMin = 1; prevBucketMin = 1; bucketStartedAt = nil
        currentVoiceFloor = Self.voiceFloor
        transcribe = nil
    }

    /// The model became ready (or went away). Safe mid-stream in either direction.
    func setTranscriber(_ t: Transcribe?) { transcribe = t }

    /// Append a captured buffer. The caller hands off an **owned** copy — capture taps reuse
    /// their backing storage under us.
    func feed(_ ownedBuffer: AVAudioPCMBuffer) {
        guard streaming else { return }
        if pauseTriggered {
            let level = RecordingCore.level(ownedBuffer)
            let now = Date()
            if bucketStartedAt == nil { bucketStartedAt = now }
            if now.timeIntervalSince(bucketStartedAt!) > Self.bucketSeconds {
                prevBucketMin = bucketMin
                bucketMin = 1
                bucketStartedAt = now
            }
            bucketMin = min(bucketMin, level)
            currentVoiceFloor = Self.adaptiveVoiceFloor(rollingMin: min(bucketMin, prevBucketMin))
            if level > currentVoiceFloor { lastVoiceAt = now }
            recentLevels.append(level)
            if recentLevels.count > Self.recentLevelCount { recentLevels.removeFirst() }
        }
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
        nextJoin = " "
        streamStartedAt = nil
        lastRotationAt = nil
        rotating = false
        streaming = false
        lastVoiceAt = nil
        recentLevels.removeAll(keepingCapacity: false)
        bucketMin = 1; prevBucketMin = 1; bucketStartedAt = nil
        currentVoiceFloor = Self.voiceFloor
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
        let stitched = (committedChunks.map(\.text) + [finalSegment])
            .filter { !$0.isEmpty }.joined(separator: " ")
        end()
        return (stitched, finalSegment)
    }

    private func committedText() -> String {
        committedChunks.reduce("") { $0 + $1.join + $1.text }
    }

    /// Chunk rotation: transcribe the live buffer into a committed chunk and clear it — at
    /// the `rotationInterval` hard cap (bounds memory), or EARLY once snapshots have grown
    /// expensive for this device (bounds per-poll inference cost — see `shouldRotate`).
    private func rotateIfNeeded() async {
        guard !rotating, let transcribe, !streamBuffers.isEmpty else { return }
        let started = lastRotationAt ?? streamStartedAt ?? Date()
        let window = Date().timeIntervalSince(started)
        let silence = (pauseTriggered && lastVoiceAt != nil)
            ? Date().timeIntervalSince(lastVoiceAt!) : nil
        guard let trigger = Self.rotationTrigger(
            sinceRotation: window, lastSnapshotCost: lastSnapshotCost,
            interval: rotationInterval, silenceFor: silence) else { return }
        // The whole feel-tuning evidence in one line (backlog ROUND 10): WHICH trigger fired,
        // how long the silence really was at fire time, and — pause mode only — the last
        // buffer levels, so a mid-sentence settle can be told apart from a real breath.
        var line = "live rotate[\(trigger.rawValue)]: committing "
            + "\(String(format: "%.1f", window))s window"
            + " (last snapshot \(Int(lastSnapshotCost * 1000))ms"
        if let silence { line += ", silence \(String(format: "%.2f", silence))s" }
        if pauseTriggered { line += String(format: ", floor %.2f", currentVoiceFloor) }
        line += ")"
        if !recentLevels.isEmpty {
            line += " levels " + recentLevels.map { String(format: "%.2f", $0) }.joined(separator: " ")
        }
        log(line)
        rotating = true
        let snapshot = streamBuffers
        streamBuffers.removeAll(keepingCapacity: true)
        defer { rotating = false }
        guard let merged = Self.concatenate(buffers: snapshot) else { return }
        if let text = try? await transcribe(merged) {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                committedChunks.append((join: committedChunks.isEmpty ? "" : nextJoin,
                                        text: trimmed))
                nextJoin = Self.chunkJoin(afterChunk: trimmed, trigger: trigger)
            }
        }
        lastRotationAt = Date()
        lastSnapshotCost = 0   // fresh (small) window — let the pacing re-measure
        // A pause-rotate must not chain: without new voice there is nothing to commit, and a
        // stale lastVoiceAt would otherwise re-fire every minPauseWindow through a long
        // silence, burning an ASR call each time on an empty window.
        lastVoiceAt = nil
    }

    // MARK: - Pure rules (unit-tested; both apps' behavior hangs off these)

    /// Why a rotation fired — logged per rotate so a real take can be read back trigger by
    /// trigger (the ROUND 10 instrumentation: "mid-sentence whitening" is only diagnosable
    /// once every settle says whether a pause, the ceiling, or the cost guard caused it).
    enum RotationTrigger: String {
        case pause      // detected phrase pause — the primary settle signal
        case ceiling    // the fixed interval — the person who never stops talking
        case cost       // snapshots grew expensive — old/hot hardware protection
    }

    /// Which trigger (if any) should rotate the live chunk now. The hard cap bounds
    /// live-buffer memory; the early path commits a window whose snapshots have grown
    /// expensive (> 1.2 s) so per-poll cost stays bounded on old/hot hardware instead of
    /// climbing for the full 25 s.
    /// `silenceFor` — seconds since the last voice-level buffer, or nil when pause detection
    /// is off / no voice has happened yet. A detected pause is the PRIMARY settle signal
    /// (phrase-boundary commits, the Apple-dictation feel); the interval is the ceiling for
    /// the person who never stops talking; the cost trigger protects old/hot hardware.
    nonisolated static func rotationTrigger(sinceRotation: TimeInterval,
                                            lastSnapshotCost: TimeInterval,
                                            interval: TimeInterval = defaultRotationInterval,
                                            silenceFor: TimeInterval? = nil) -> RotationTrigger? {
        if let silenceFor, silenceFor >= pauseHangover, sinceRotation >= minPauseWindow {
            return .pause
        }
        if sinceRotation > interval { return .ceiling }
        // The early path only matters when it beats the cap (the phone's 25 s on old/hot
        // hardware); with a short cap it simply never fires first.
        if sinceRotation > 10, lastSnapshotCost > 1.2 { return .cost }
        return nil
    }

    /// Whether the live chunk should rotate now — `rotationTrigger`'s yes/no face.
    nonisolated static func shouldRotate(sinceRotation: TimeInterval,
                                         lastSnapshotCost: TimeInterval,
                                         interval: TimeInterval = defaultRotationInterval,
                                         silenceFor: TimeInterval? = nil) -> Bool {
        rotationTrigger(sinceRotation: sinceRotation, lastSnapshotCost: lastSnapshotCost,
                        interval: interval, silenceFor: silenceFor) != nil
    }

    /// The voice floor in force given the stream's own rolling minimum level: the quietest
    /// buffer a mic has produced lately IS its silence, so speech is anything a margin
    /// above that — clamped so a genuinely quiet mic keeps the tuned static floor. Measured
    /// basis in `voiceFloorMargin`'s doc.
    nonisolated static func adaptiveVoiceFloor(rollingMin: Float) -> Float {
        max(voiceFloor, rollingMin + voiceFloorMargin)
    }

    /// The separator the chunk AFTER `chunk` should join with — the phone's own paragraph
    /// rule (`Paragrapher`: a sentence-ending word + a silence ≥ 0.65 s starts a new
    /// paragraph) read off the live boundary we already know: a pause-rotate only fires
    /// after ≥ `pauseHangover` (0.8 s) of measured real silence, past the Paragrapher's gap
    /// by construction — so "pause-rotated AND ended a sentence" IS that rule, live. Ceiling
    /// and cost rotates are not speech boundaries (the person kept talking); they join with
    /// a space, exactly as before. Timer-only mode (the phone) can never produce `.pause`,
    /// so its committed text is byte-identical.
    nonisolated static func chunkJoin(afterChunk chunk: String, trigger: RotationTrigger) -> String {
        guard trigger == .pause,
              let lastWord = chunk.split(whereSeparator: \.isWhitespace).last,
              Paragrapher.endsSentence(String(lastWord)) else { return " " }
        return "\n\n"
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
