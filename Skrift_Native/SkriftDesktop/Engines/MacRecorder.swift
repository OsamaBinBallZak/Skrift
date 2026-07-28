import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation
import Observation
import os

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
        case failed(Refusal)
    }

    /// Why a take couldn't start — and, the part that matters, whether the user can DO
    /// anything about it. A refusal used to be a bare sentence, so the two cases that are
    /// worlds apart for the person holding the mouse ("this Mac has no microphone" and
    /// "we're switched off in Privacy settings") arrived looking identical: a wall of text
    /// with no way forward. `permissionDenied` in particular is a TRAP — once TCC holds a
    /// denial the system never prompts again, so pressing Record can look broken forever
    /// while every log line says the app asked politely. That case gets a button.
    enum Refusal: Equatable {
        /// No input device at all — a mini or a Studio with nothing plugged in.
        case noInputDevice
        /// TCC says no. Nothing the app does will prompt again; only Settings clears it.
        case permissionDenied
        /// Managed device / parental controls. Same dead end, different owner.
        case permissionRestricted
        /// A device exists but offers a 0 Hz format — the classic "no input selected".
        case noUsableFormat
        /// The engine or the output file refused, with CoreAudio's own words.
        case engineFailed(String)
        /// The engine ran but the input delivered no audio at all — carries the device name.
        /// This is the dozing-Bluetooth signature: the take LOOKS live (transport up, timer
        /// counting) while zero buffers arrive, and before this case existed the failure was
        /// routed to a value nothing renders, so the whole thing read as "the app did nothing"
        /// (Tuur, twice, 2026-07-28).
        case nothingCaptured(String)
        /// Buffers arrived but every sample was exactly zero — same family, said precisely.
        case recordedSilence(String)

        var message: String {
            switch self {
            case .noInputDevice:
                "This Mac has no microphone. Connect one (or a headset) and try again."
            case .permissionDenied:
                "Skrift isn't allowed to use the microphone. Turn it on in Privacy & Security ▸ Microphone — macOS won't ask again on its own."
            case .permissionRestricted:
                "Microphone access is restricted on this Mac, so Skrift can't record."
            case .noUsableFormat:
                "No microphone is available. Check System Settings ▸ Sound ▸ Input."
            case .engineFailed(let why):
                "Couldn't start recording: \(why)"
            case .nothingCaptured(let device):
                "“\(device)” delivered no audio — a Bluetooth mic may be asleep. Wake it, or pick another input in System Settings ▸ Sound ▸ Input."
            case .recordedSilence(let device):
                "“\(device)” recorded only silence. Check it's the mic you meant in System Settings ▸ Sound ▸ Input."
            }
        }

        /// True when System Settings ▸ Privacy & Security ▸ Microphone is where this gets
        /// fixed — the alert grows a button that goes straight there.
        var fixedInPrivacySettings: Bool {
            self == .permissionDenied || self == .permissionRestricted
        }

        /// Deep link to the exact pane. Only meaningful when `fixedInPrivacySettings`.
        static let privacySettingsURL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
    }

    /// Every gate in `start()` logs its verdict. This exists because the record path failed
    /// twice with the user watching and nothing written down anywhere — diagnosing it meant
    /// asking a person what a dialog said, and running `-miccheck` from a shell turned out to
    /// answer for the SHELL HOST's TCC identity, not this app's (2026-07-28: it read DENIED
    /// both before and after a successful `tccutil reset`, because the denial it was reading
    /// belonged to the terminal's responsible process). The one attribution that is always
    /// honest is the GUI app asking about itself — so it says what it sees, where
    /// `log show --predicate 'subsystem == "com.skrift.desktop"'` can read it back.
    private static let log = Logger(subsystem: "com.skrift.desktop", category: "record")

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
    /// The input this take is actually listening to — for the stop-time verdict, so a dead
    /// take can NAME the device that produced it instead of shrugging.
    private var activeInputName = "the microphone"
    /// Did the tap ever deliver a non-zero sample? A dozing Bluetooth mic produces either no
    /// buffers at all or exact digital zeros — a real mic's noise floor is never exactly 0.
    private var sawSignal = false

    /// Ask for the mic, then start. Returns false when permission was refused or the engine
    /// refused to start — `state` carries the message either way.
    @discardableResult
    func start() async -> Bool {
        guard state != .recording else { return true }
        Self.log.notice("start(): tcc=\(AVCaptureDevice.authorizationStatus(for: .audio).rawValue, privacy: .public) hasInput=\(Self.hasInputDevice, privacy: .public)")
        // Hardware first: asking for permission to use a mic that doesn't exist prompts the
        // user for nothing and then fails anyway.
        guard Self.hasInputDevice else {
            Self.log.error("start(): REFUSED — no input device")
            state = .failed(.noInputDevice)
            return false
        }
        guard await Self.requestMicAccess() else {
            // Re-read AFTER the request: `.notDetermined` becomes `.denied` the moment the
            // user clicks Don't Allow, and that is the case worth naming precisely — from
            // then on macOS never prompts again, so the only way back is Settings.
            let status = AVCaptureDevice.authorizationStatus(for: .audio)
            Self.log.error("start(): REFUSED — mic access, tcc now=\(status.rawValue, privacy: .public)")
            state = .failed(Self.refusal(for: status))
            return false
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        // The phone's b119 policy, ported: with Bluetooth around, record on a wired mic.
        // The system default here was "Chonky pods" (BT) — awake for the first two takes,
        // asleep for every click after, delivering zero buffers into a live-looking
        // transport. A BT input is only used when it is the ONLY input; the engine is
        // pointed at the picked device directly, so the system default is never touched.
        let inputs = Self.inputDevices()
        let chosen = Self.pickInput(from: inputs, systemDefault: Self.defaultInputID)
        if let chosen {
            activeInputName = chosen.name
            if chosen.id != Self.defaultInputID, let au = input.audioUnit {
                var dev = chosen.id
                let err = AudioUnitSetProperty(au, kAudioOutputUnitProperty_CurrentDevice,
                                               kAudioUnitScope_Global, 0, &dev,
                                               UInt32(MemoryLayout<AudioDeviceID>.size))
                Self.log.notice("start(): input ← \(chosen.name, privacy: .public) (default is BT; err=\(err, privacy: .public))")
            }
        }
        // Read the format AFTER the device choice — it follows the device.
        let format = input.inputFormat(forBus: 0)
        Self.log.notice("start(): granted, input=\(self.activeInputName, privacy: .public) of \(inputs.count, privacy: .public), format=\(format.sampleRate, privacy: .public)Hz/\(format.channelCount, privacy: .public)ch")
        // A zero sample rate is what a missing/disabled input device reports. Starting the
        // engine on it throws deep inside CoreAudio, so catch it here where we can explain it.
        guard format.sampleRate > 0, format.channelCount > 0 else {
            Self.log.error("start(): REFUSED — 0 Hz input format")
            state = .failed(.noUsableFormat)
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
                Task { @MainActor [weak self] in
                    self?.meter.push(level)
                    if level > 0 { self?.sawSignal = true }
                }
            }
            engine.prepare()
            try engine.start()
            Self.log.notice("start(): RECORDING → \(dest.lastPathComponent, privacy: .public)")
            self.engine = engine
            self.file = out
            self.url = dest
            self.startedAt = Date()
            self.elapsed = 0
            self.meter = RecordingCore.Meter()
            self.sawSignal = false
            self.state = .recording
            startTicker()
            return true
        } catch {
            Self.log.error("start(): ENGINE THREW — \(String(describing: error), privacy: .public)")
            input.removeTap(onBus: 0)
            state = .failed(.engineFailed(error.localizedDescription))
            return false
        }
    }

    /// Stop and hand back the finished file, or nil if nothing usable was captured. The
    /// caller ingests it exactly like an imported file — that is the whole point: a Mac
    /// recording is not a new kind of thing, it is a file arriving by a different door.
    ///
    /// A dead take leaves `state` at `.failed` with the device's NAME, never `.idle`. This
    /// path used to fold "nothing arrived" into a silent nil, and the caller's message went
    /// somewhere invisible — so a dozing Bluetooth mic produced a transport that counted,
    /// a stop that shrugged, and a user who reasonably concluded the feature was broken.
    @discardableResult
    func stop() -> URL? {
        guard state == .recording else { return nil }
        Self.log.notice("stop(): after \(RecordingCore.elapsedLabel(self.elapsed), privacy: .public), signal=\(self.sawSignal, privacy: .public)")
        ticker?.invalidate(); ticker = nil
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        file = nil                      // closes the file, flushing the encoder
        let finished = url
        url = nil
        startedAt = nil
        let size = finished.flatMap { try? FileManager.default.attributeOfItemSize(at: $0) } ?? 0
        // No signal = a broken take whatever its byte count: an encoder fed zeros (or
        // nothing) still writes headers and frames, so size alone can't tell a quiet room
        // from a dead input. Delete it and say which device let us down.
        guard let finished, size > 1024, sawSignal else {
            if let finished { try? FileManager.default.removeItem(at: finished) }
            elapsed = 0
            state = .failed(size > 1024 ? .recordedSilence(activeInputName)
                                        : .nothingCaptured(activeInputName))
            Self.log.error("stop(): DEAD TAKE — \(size, privacy: .public) bytes from \(self.activeInputName, privacy: .public)")
            return nil
        }
        state = .idle
        return finished
    }

    /// Abandon the take and delete the file — for a cancel, or a window closing mid-record.
    /// Clears any stop-time verdict too: the user threw this take away on purpose, so a
    /// "nothing was captured" complaint about it would be noise.
    func cancel() {
        let dead = stop()
        clearFailure()
        guard let dead else { return }
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

    // MARK: - Input choice (the phone's b119 policy, ported)

    /// One capture-capable device, as the pick rule sees it. `isBluetooth` is precomputed
    /// from the CoreAudio transport type so the rule itself stays pure and host-testable.
    struct InputDevice: Equatable {
        var id: AudioDeviceID
        var name: String
        var isBluetooth: Bool
    }

    /// Which input a take should listen to. The phone learned this policy on hardware
    /// (b114–b119, the AirPods saga): a Bluetooth mic is the one class of input that can be
    /// present, selected, and asleep — so with Bluetooth around, record on a wired mic. Here:
    /// keep the system default unless it's Bluetooth AND a non-Bluetooth input exists, in
    /// which case take the first non-Bluetooth one. A Bluetooth-only Mac still records over
    /// Bluetooth — a maybe-asleep mic beats no mic, and the stop-time verdict catches the
    /// sleeping case by name.
    nonisolated static func pickInput(from devices: [InputDevice],
                                      systemDefault: AudioDeviceID?) -> InputDevice? {
        guard !devices.isEmpty else { return nil }
        let fallback = devices.first { $0.id == systemDefault } ?? devices[0]
        guard fallback.isBluetooth, let wired = devices.first(where: { !$0.isBluetooth }) else {
            return fallback
        }
        return wired
    }

    /// Every device with at least one input stream, in CoreAudio's enumeration order.
    static func inputDevices() -> [InputDevice] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(0)
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),
                                             &address, 0, nil, &size) == noErr, size > 0 else { return [] }
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),
                                         &address, 0, nil, &size, &ids) == noErr else { return [] }
        return ids.compactMap { id in
            guard hasInputStreams(id) else { return nil }
            return InputDevice(id: id, name: deviceName(id) ?? "Unknown input",
                               isBluetooth: isBluetoothTransport(id))
        }
    }

    private static func hasInputStreams(_ id: AudioDeviceID) -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioObjectPropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(0)
        return AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr && size > 0
    }

    private static func deviceName(_ id: AudioDeviceID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var name: CFString? = nil
        var size = UInt32(MemoryLayout<CFString?>.size)
        let status = withUnsafeMutablePointer(to: &name) {
            AudioObjectGetPropertyData(id, &address, 0, nil, &size, $0)
        }
        return status == noErr ? name as String? : nil
    }

    private static func isBluetoothTransport(_ id: AudioDeviceID) -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyTransportType,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var transport = UInt32(0)
        var size = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &transport) == noErr else { return false }
        return transport == kAudioDeviceTransportTypeBluetooth
            || transport == kAudioDeviceTransportTypeBluetoothLE
    }

    /// The system's default input device id, or nil when there is none at all.
    static var defaultInputID: AudioDeviceID? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var deviceID = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID)
        return (status == noErr && deviceID != kAudioObjectUnknown) ? deviceID : nil
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
    static var hasInputDevice: Bool { defaultInputID != nil }

    private static func requestMicAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
        default: return false
        }
    }

    /// TCC's verdict, translated into something the UI can act on. Split out from `start()`
    /// so it can be tested without a microphone, a grant, or a running app — the mapping is
    /// the part that decides whether the user is offered a way out, and it was previously
    /// buried in an async function that needs real hardware to reach.
    nonisolated static func refusal(for status: AVAuthorizationStatus) -> Refusal {
        switch status {
        case .restricted: .permissionRestricted
        // `.notDetermined` reaching here means the prompt itself was declined (or could not
        // be shown, as from a CLI launch) — either way the grant is now withheld, and
        // treating it as anything softer than "denied" would send the user looking for a
        // prompt that will never come.
        default: .permissionDenied
        }
    }
}

private extension FileManager {
    func attributeOfItemSize(at url: URL) throws -> Int {
        (try attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }
}
