import AVFoundation
import CoreAudio
import Foundation
import Observation

/// Microphone capture on the Mac. The phone's `LiveRecordingService` could not be ported —
/// it is built around `AVAudioSession`, which does not exist on macOS — so this is the
/// platform half, deliberately small: tap the input, write an m4a, publish elapsed + level.
/// Everything that decides how the recording sounds, what it is called, and how the meter
/// reads comes from the SHARED `RecordingCore`, so a Mac memo and a phone memo are the same
/// artefact.
///
/// macOS needs no session category and has no route-change war (no HFP flip, no
/// interruptions): you pick an input in System Settings and it stays. What it DOES need,
/// which iOS does not, is the sandbox's `com.apple.security.device.audio-input` entitlement
/// plus a usage string — without both, `installTap` yields silence rather than an error.
@MainActor
@Observable
final class MacRecorder {

    enum State: Equatable {
        case idle
        case recording
        /// The mic was refused, or the engine could not start. Carries what to tell the user.
        case failed(String)
    }

    private(set) var state: State = .idle
    private(set) var elapsed: TimeInterval = 0
    private(set) var meter = RecordingCore.Meter()

    var isRecording: Bool { state == .recording }
    var elapsedLabel: String { RecordingCore.elapsedLabel(elapsed) }

    private var engine: AVAudioEngine?
    private var file: AVAudioFile?
    private var url: URL?
    private var startedAt: Date?
    private var ticker: Timer?

    /// Ask for the mic, then start. Returns false when permission was refused or the engine
    /// refused to start — `state` carries the message either way.
    @discardableResult
    func start() async -> Bool {
        guard state != .recording else { return true }
        // Hardware first: asking for permission to use a mic that doesn't exist prompts the
        // user for nothing and then fails anyway.
        guard Self.hasInputDevice else {
            state = .failed("This Mac has no microphone. Connect one (or a headset) and try again.")
            return false
        }
        guard await Self.requestMicAccess() else {
            state = .failed("Skrift needs microphone access. Grant it in System Settings ▸ Privacy & Security ▸ Microphone.")
            return false
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)
        // A zero sample rate is what a missing/disabled input device reports. Starting the
        // engine on it throws deep inside CoreAudio, so catch it here where we can explain it.
        guard format.sampleRate > 0, format.channelCount > 0 else {
            state = .failed("No microphone is available. Check System Settings ▸ Sound ▸ Input.")
            return false
        }
        let dest = AppPaths.recordingsDirectory.appendingPathComponent(RecordingCore.filename())
        do {
            try FileManager.default.createDirectory(at: AppPaths.recordingsDirectory,
                                                    withIntermediateDirectories: true)
            let out = try AVAudioFile(forWriting: dest,
                                      settings: RecordingCore.encoderSettings(for: format))
            input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
                // Write on the audio thread (AVAudioFile is safe for serial writes from one
                // thread); only the meter hops to main, at buffer rate rather than per sample.
                try? out.write(from: buffer)
                let level = RecordingCore.level(buffer)
                Task { @MainActor [weak self] in self?.meter.push(level) }
            }
            engine.prepare()
            try engine.start()
            self.engine = engine
            self.file = out
            self.url = dest
            self.startedAt = Date()
            self.elapsed = 0
            self.meter = RecordingCore.Meter()
            self.state = .recording
            startTicker()
            return true
        } catch {
            input.removeTap(onBus: 0)
            state = .failed("Couldn't start recording: \(error.localizedDescription)")
            return false
        }
    }

    /// Stop and hand back the finished file, or nil if nothing usable was captured. The
    /// caller ingests it exactly like an imported file — that is the whole point: a Mac
    /// recording is not a new kind of thing, it is a file arriving by a different door.
    @discardableResult
    func stop() -> URL? {
        guard state == .recording else { return nil }
        ticker?.invalidate(); ticker = nil
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        file = nil                      // closes the file, flushing the encoder
        state = .idle
        let finished = url
        url = nil
        startedAt = nil
        guard let finished,
              let size = try? FileManager.default.attributeOfItemSize(at: finished),
              size > 1024 else {        // an empty/silent stub helps nobody
            if let finished { try? FileManager.default.removeItem(at: finished) }
            elapsed = 0
            return nil
        }
        return finished
    }

    /// Abandon the take and delete the file — for a cancel, or a window closing mid-record.
    func cancel() {
        guard let dead = stop() else { return }
        try? FileManager.default.removeItem(at: dead)
    }

    func clearFailure() { if case .failed = state { state = .idle } }

    private func startTicker() {
        ticker?.invalidate()
        // 4 Hz: the label has 1s resolution and the meter is pushed by the tap, not by this.
        ticker = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let started = self.startedAt else { return }
                self.elapsed = Date().timeIntervalSince(started)
            }
        }
    }

    /// Is there a microphone AT ALL — asked of the audio hardware, not of TCC.
    ///
    /// This distinction is the whole point. `AVCaptureDevice.DiscoverySession` and
    /// `inputNode.inputFormat` BOTH come back empty/0 Hz in two completely different
    /// situations: a machine with no mic, and a machine with a mic we haven't been granted
    /// yet. Using either to decide whether to offer recording would disable the feature on
    /// every Mac that simply hasn't been asked yet. CoreAudio's default-input property is not
    /// gated by privacy, so it answers the hardware question honestly.
    ///
    /// (Found the hard way: a Mac mini with no input device at all reported "no microphone"
    /// through a code path that looked identical to "permission pending".)
    static var hasInputDevice: Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var deviceID = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID)
        return status == noErr && deviceID != kAudioObjectUnknown
    }

    private static func requestMicAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
        default: return false
        }
    }
}

private extension FileManager {
    func attributeOfItemSize(at url: URL) throws -> Int {
        (try attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }
}
