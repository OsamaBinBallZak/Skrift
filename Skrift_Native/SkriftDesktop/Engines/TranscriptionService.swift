import Foundation
import AVFoundation
import CoreML
import FluidAudio
import os

enum ASRError: LocalizedError {
    case notInitialized
    var errorDescription: String? { "ASR model is not loaded." }
}

/// On-device transcription via FluidAudio (Parakeet TDT v3). Models download from
/// HuggingFace on first use (~600 MB) and cache locally — matching the app's
/// HF-download distribution. Lives in `Engines/` (app target only) so FluidAudio
/// stays out of the host-less logic test target; the deterministic post-processing
/// (BPEMerge / ImageMarkers) is tested separately. Mirrors Shhhcribble + the phone's
/// TranscriptionService on FluidAudio `main`.
actor TranscriptionService: Transcribing {
    static let shared = TranscriptionService()

    private var asr: AsrManager?
    private var models: AsrModels?
    private var loadTask: Task<Void, Error>?
    private var isTranscribing = false
    /// Which language mode the LOADED manager was built for — flipping the setting has
    /// to REBUILD it (the config is baked in at `AsrManager(config:)`), exactly as the
    /// phone does. Without this the Mac would keep transcribing with the old config
    /// until relaunch.
    private var loadedMultilingual: Bool?

    /// Nonisolated, thread-safe mirror of `isModelReady` so the synchronous /health
    /// handler can read it without hopping onto the actor. Kept in sync with `asr`.
    private let ready = OSAllocatedUnfairLock(initialState: false)
    nonisolated var isModelReadySync: Bool { ready.withLock { $0 } }

    private init() {}

    var isModelReady: Bool { asr != nil }

    /// Load Parakeet v3 (multilingual incl. EN+NL). First call downloads from HF.
    func ensureLoaded(onProgress: @Sendable @escaping (Double) -> Void = { _ in }) async throws {
        // The language mode is baked into the manager's config, so a change must rebuild
        // it (mirrors the phone). Settings → Transcription; syncs from the other devices.
        let mode = ASRLanguageMode.from(
            multilingual: SettingsStore.shared.load().transcriptionIsMultilingual)
        if asr != nil, loadedMultilingual == mode.isMultilingual { return }
        if asr != nil {
            asr = nil; models = nil
            ready.withLock { $0 = false }
        }
        if let loadTask { try await loadTask.value; return }
        let task = Task<Void, Error> {
            let cfg = MLModelConfiguration()
            cfg.computeUnits = .cpuAndNeuralEngine
            let loaded = try await AsrModels.downloadAndLoad(configuration: cfg, version: .v3,
                                                             progressHandler: { onProgress($0.fractionCompleted) })
            // `melChunkContext` comes from the SHARED derivation — the Mac used to pass
            // `.default` (English-tuned) with no way to change it, which garbled Dutch.
            let manager = AsrManager(config: ASRConfig(melChunkContext: mode.melChunkContext))
            try await manager.loadModels(loaded)
            self.models = loaded
            self.asr = manager
            self.loadedMultilingual = mode.isMultilingual
            self.ready.withLock { $0 = true }
        }
        loadTask = task
        do { try await task.value; loadTask = nil }
        catch { loadTask = nil; throw error }
    }

    func unload() {
        guard !isTranscribing, loadTask == nil else { return }
        let manager = asr
        asr = nil
        models = nil
        loadedMultilingual = nil
        ready.withLock { $0 = false }
        Task { await manager?.cleanup() }
    }

    func transcribe(audioURL: URL, imageManifest: [ImageManifestEntry] = []) async throws -> TranscriptionResult {
        isTranscribing = true
        defer { isTranscribing = false }
        try await ensureLoaded()
        guard let asr else { throw ASRError.notInitialized }

        let inputURL = Self.preprocessed(audioURL) ?? audioURL   // high-pass + normalize, else original
        let started = Date()
        var state = TdtDecoderState.make()
        let result = try await asr.transcribe(inputURL, decoderState: &state)
        let ms = Int(Date().timeIntervalSince(started) * 1000)

        // The tail (phantom guard → BPE merge → vocab rescore → timings → markers) is
        // the SHARED `ASRPostProcess` — one copy with the phone, so the order those
        // passes run in can't drift between the apps. RMS reads the ORIGINAL file, not
        // the preprocessed one, and only for a suspiciously tiny transcript.
        return await ASRPostProcess.finish(
            rawText: result.text,
            tokens: (result.tokenTimings ?? []).map {
                RawToken(token: $0.token, startTime: $0.startTime, endTime: $0.endTime)
            },
            confidence: Double(result.confidence),
            durationMs: ms,
            imageManifest: imageManifest,
            rms: { AudioRMS.averageRMS(url: audioURL) },
            rescore: { text in
                // The Mac's word list is its Settings; the spotter resamples the
                // ORIGINAL audio itself.
                let customWords = SettingsStore.shared.load().customWords
                guard !customWords.isEmpty else { return nil }
                return await VocabularyBooster.shared.boost(
                    text: text, tokenTimings: result.tokenTimings ?? [],
                    audioURL: audioURL, words: customWords)?.text
            })
    }

    /// High-pass + normalize the original into a 16 kHz mono `processed.wav` next to
    /// it, per the user's `highpassFreqHz` setting (the afftdn denoiser has no native
    /// equivalent and was dropped — see A4). Returns nil (→ transcribe the original)
    /// when the high-pass is off or preprocessing fails.
    private static func preprocessed(_ original: URL) -> URL? {
        let hp = SettingsStore.shared.load().highpassFreqHz
        guard hp > 0 else { return nil }
        let out = original.deletingLastPathComponent().appendingPathComponent("processed.wav")
        return AudioPreprocessor.process(input: original, output: out, highpassHz: hp) ? out : nil
    }

}
