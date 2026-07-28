import AVFoundation
import AudioToolbox
import CoreAudio
import CoreMedia
import Foundation
import Observation
import os

/// Microphone capture on the Mac. The phone's `LiveRecordingService` could not be ported —
/// it is built around `AVAudioSession`, which does not exist on macOS — so this is the
/// platform half, deliberately small: capture the input, write an m4a, publish elapsed + level.
/// Everything that decides how the recording sounds, what it is called, and how the meter
/// reads comes from the SHARED `RecordingCore`, so a Mac memo and a phone memo are the same
/// artefact.
///
/// **Built on `AVCaptureSession`, not `AVAudioEngine`** (rebuilt 2026-07-28 —
/// `LANES-2026-07-28/RESEARCH_MIC.md`). The previous version pointed `AVAudioEngine.inputNode`
/// at a specific device by poking `kAudioOutputUnitProperty_CurrentDevice` on
/// `inputNode.audioUnit` — but `inputNode` and `outputNode` SHARE one `AUAudioUnit` on macOS,
/// defaulting to the system output device, and reassigning it from outside the engine's own
/// state machine is not a supported reconfiguration path. The observed symptoms (near-zero
/// buffers, or buffers that decode as noise) match Apple's own guidance: the engine's cached
/// node format and the real HAL device end up disagreeing. `AVCaptureSession` +
/// `AVCaptureDeviceInput` takes a specific device BY CONSTRUCTION, so this class of bug is
/// unrepresentable now.
///
/// macOS needs no session category and has no route-change war (no HFP flip, no
/// interruptions): you pick an input in System Settings and it stays. What it DOES need,
/// which iOS does not, is the sandbox's `com.apple.security.device.audio-input` entitlement
/// plus a usage string — without both, capture yields silence rather than an error.
@MainActor
@Observable
final class MacRecorder {

    enum State: Equatable {
        case idle
        case recording
        /// The mic was refused, or the session could not start. Carries what to tell the user.
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
        /// A device exists (CoreAudio's default-input answers yes) but the capture layer
        /// can't get a usable object from it — the AVCaptureSession-era shape of the old
        /// "0 Hz format" case: same dead end, same fix.
        case noUsableFormat
        /// The session or the output file refused, with CoreAudio's own words.
        case engineFailed(String)
        /// The session ran but the input delivered no audio at all — carries the device name.
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

    // MARK: - capture plumbing

    private var session: AVCaptureSession?
    private var deviceInput: AVCaptureDeviceInput?
    private var audioOutput: AVCaptureAudioDataOutput?
    private var sampleSink: SampleSink?
    /// `startRunning`/`stopRunning` both block — never touched from Main. One dedicated queue
    /// for the pair so a stop can never race a start's configuration.
    private let configQueue = DispatchQueue(label: "com.skrift.desktop.record.session")
    /// The sample delegate's own queue — never Main, never `configQueue`.
    private let callbackQueue = DispatchQueue(label: "com.skrift.desktop.record.samples")

    private var url: URL?
    private var startedAt: Date?
    private var ticker: Timer?
    /// The input this take is actually listening to — for the stop-time verdict, so a dead
    /// take can NAME the device that produced it instead of shrugging.
    private var activeInputName = "the microphone"
    /// Did the sink ever deliver a non-zero sample? A dozing Bluetooth mic produces either no
    /// buffers at all or exact digital zeros — a real mic's noise floor is never exactly 0.
    private var sawSignal = false
    /// Has the FIRST buffer of this take arrived yet? Drives both the fail-fast timer and the
    /// first-buffer-opens-the-file rule.
    private var receivedFirstBuffer = false
    private var disconnectObserver: NSObjectProtocol?
    private var runtimeErrorObserver: NSObjectProtocol?
    /// Bumped once per `start()`. The fail-fast timer and the sink's closures are async and
    /// outlive any single take's lifetime by design — without tagging them, a quick
    /// Record→Stop→Record cycle under 1.5s would let the FIRST take's fail-fast timer fire
    /// during the SECOND take and kill it. Every async callback checks its captured generation
    /// against the current one before touching state.
    private var takeGeneration = 0

    /// Ask for the mic, then start. Returns false when permission was refused or the session
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
        // The phone's b119 policy, ported: with Bluetooth around, record on a wired mic.
        let inputs = Self.inputDevices()
        guard let chosen = Self.pickInput(from: inputs, systemDefault: Self.defaultInputID) else {
            Self.log.error("start(): REFUSED — hardware sees an input but AVCaptureDevice does not")
            state = .failed(.noUsableFormat)
            return false
        }
        activeInputName = chosen.name
        guard let captureDevice = Self.captureDevice(forID: chosen.id) else {
            Self.log.error("start(): REFUSED — could not resolve AVCaptureDevice for \(chosen.name, privacy: .public)")
            state = .failed(.noUsableFormat)
            return false
        }
        Self.log.notice("start(): input ← \(chosen.name, privacy: .public) of \(inputs.count, privacy: .public)")

        let dest = AppPaths.recordingsDirectory.appendingPathComponent(RecordingCore.filename())
        do {
            try FileManager.default.createDirectory(at: AppPaths.recordingsDirectory,
                                                    withIntermediateDirectories: true)
        } catch {
            Self.log.error("start(): REFUSED — could not create recordings directory: \(String(describing: error), privacy: .public)")
            state = .failed(.engineFailed(error.localizedDescription))
            return false
        }

        let input: AVCaptureDeviceInput
        do {
            input = try AVCaptureDeviceInput(device: captureDevice)
        } catch {
            Self.log.error("start(): ENGINE THREW building the input — \(String(describing: error), privacy: .public)")
            state = .failed(.engineFailed(error.localizedDescription))
            return false
        }

        let session = AVCaptureSession()
        session.beginConfiguration()
        guard session.canAddInput(input) else {
            session.commitConfiguration()
            Self.log.error("start(): REFUSED — session could not add the input")
            state = .failed(.engineFailed("the microphone input could not be added to the capture session"))
            return false
        }
        session.addInput(input)

        let output = AVCaptureAudioDataOutput()
        // Float32, non-interleaved: RecordingCore.level() reads floatChannelData?[0] assuming
        // non-interleaved float samples — an interleaved stereo buffer would alias two
        // channels into one RMS read. Sample rate and channel COUNT are deliberately left
        // unset here so they follow the device's own negotiated format; only the sample
        // representation is fixed.
        output.audioSettings = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            // The one settings constant with no "Key" suffix — its siblings all have one.
            AVLinearPCMIsNonInterleaved: true,
        ]
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            Self.log.error("start(): REFUSED — session could not add the audio output")
            state = .failed(.engineFailed("the audio output could not be added to the capture session"))
            return false
        }
        session.addOutput(output)
        session.commitConfiguration()

        takeGeneration += 1
        let generation = takeGeneration
        receivedFirstBuffer = false
        sawSignal = false

        let sink = SampleSink(destination: dest,
            onFirstBuffer: { [weak self] format in
                Task { @MainActor [weak self] in
                    guard let self, self.takeGeneration == generation else { return }
                    self.receivedFirstBuffer = true
                    Self.log.notice("start(): FIRST BUFFER ← \(self.activeInputName, privacy: .public) format=\(format.sampleRate, privacy: .public)Hz/\(format.channelCount, privacy: .public)ch")
                }
            },
            onLevel: { [weak self] level in
                Task { @MainActor [weak self] in
                    guard let self, self.takeGeneration == generation else { return }
                    self.meter.push(level)
                    if level > 0 { self.sawSignal = true }
                }
            })
        output.setSampleBufferDelegate(sink, queue: callbackQueue)

        self.session = session
        self.deviceInput = input
        self.audioOutput = output
        self.sampleSink = sink
        self.url = dest
        self.startedAt = Date()
        self.elapsed = 0
        self.meter = RecordingCore.Meter()
        self.state = .recording
        startTicker()
        installLossObservers(device: captureDevice, session: session, generation: generation)
        scheduleFailFastCheck(generation: generation)

        Self.log.notice("start(): session configured, dispatching startRunning() on \(self.activeInputName, privacy: .public) → \(dest.lastPathComponent, privacy: .public)")
        configQueue.async { session.startRunning() }
        return true
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
        teardownSession()               // drops the sink → its AVAudioFile deallocates → closes
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
        // 4 Hz: the label has 1s resolution and the meter is pushed by the sink, not by this.
        ticker = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let started = self.startedAt else { return }
                self.elapsed = Date().timeIntervalSince(started)
            }
        }
    }

    /// Tear down everything session-side: observers, the delegate (so the output releases the
    /// sink), then the session itself. Dispatched off Main — brief's rule: the main thread
    /// must never wait on the session, only ever hand it work.
    private func teardownSession() {
        if let observer = disconnectObserver { NotificationCenter.default.removeObserver(observer); disconnectObserver = nil }
        if let observer = runtimeErrorObserver { NotificationCenter.default.removeObserver(observer); runtimeErrorObserver = nil }
        audioOutput?.setSampleBufferDelegate(nil, queue: nil)
        let sessionToStop = session
        session = nil
        deviceInput = nil
        audioOutput = nil
        sampleSink = nil                 // drops the last strong ref → AVAudioFile deallocates → closes/flushes
        configQueue.async { sessionToStop?.stopRunning() }
    }

    // MARK: - mid-take device loss (brief §7)

    private func installLossObservers(device: AVCaptureDevice, session: AVCaptureSession, generation: Int) {
        let center = NotificationCenter.default
        disconnectObserver = center.addObserver(forName: .AVCaptureDeviceWasDisconnected, object: device, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.handleLoss(reason: "device disconnected", generation: generation) }
        }
        runtimeErrorObserver = center.addObserver(forName: .AVCaptureSessionRuntimeError, object: session, queue: .main) { [weak self] note in
            let why = (note.userInfo?[AVCaptureSessionErrorKey] as? Error)?.localizedDescription ?? "session runtime error"
            Task { @MainActor [weak self] in self?.handleLoss(reason: why, generation: generation) }
        }
    }

    /// A device vanished, or the session itself errored, mid-take. Captured words beat a
    /// clean error: if the take already holds signal, it SURVIVES — `state` stays `.recording`
    /// and the file/url stay put, so the next `stop()` call (whenever it comes) finalizes and
    /// returns it exactly like a user-pressed stop. Only a take that holds NOTHING gets the
    /// dead-take verdict immediately, because there is nothing to lose by finalizing now.
    private func handleLoss(reason: String, generation: Int) {
        guard state == .recording, takeGeneration == generation else { return }
        Self.log.error("handleLoss(): input lost mid-take (\(reason, privacy: .public)) — signal=\(self.sawSignal, privacy: .public)")
        teardownSession()
        ticker?.invalidate(); ticker = nil   // freeze the displayed time — a torn-down session must not keep counting
        guard !sawSignal else { return }     // survives: left exactly as a normal in-progress take
        let name = activeInputName
        if let finished = url { try? FileManager.default.removeItem(at: finished) }
        url = nil
        startedAt = nil
        elapsed = 0
        state = .failed(.nothingCaptured(name))
    }

    // MARK: - fail-fast (brief §6)

    /// Pure decision: has this take gone long enough with nothing delivered that it should be
    /// given up on? Free of `Timer`/`Task`/`Date` so it's testable without waiting on a clock.
    nonisolated static func shouldFailFast(elapsedSinceStart: TimeInterval, hasReceivedBuffer: Bool) -> Bool {
        !hasReceivedBuffer && elapsedSinceStart >= 1.5
    }

    private func scheduleFailFastCheck(generation: Int) {
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard let self, self.takeGeneration == generation, self.state == .recording else { return }
            guard Self.shouldFailFast(elapsedSinceStart: 1.5, hasReceivedBuffer: self.receivedFirstBuffer) else { return }
            Self.log.error("start(): FAIL-FAST — no buffer within 1.5s from \(self.activeInputName, privacy: .public)")
            let name = self.activeInputName
            self.teardownSession()
            self.ticker?.invalidate(); self.ticker = nil
            if let finished = self.url { try? FileManager.default.removeItem(at: finished) }
            self.url = nil
            self.startedAt = nil
            self.elapsed = 0
            self.state = .failed(.nothingCaptured(name))
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

    /// Every audio-capture-capable device macOS exposes to `AVCaptureDevice`, translated to
    /// our `AudioDeviceID`-keyed struct so `pickInput`'s policy (and its tests) stay untouched
    /// by the switch away from `AVAudioEngine`.
    static func inputDevices() -> [InputDevice] {
        let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external],
                                                         mediaType: .audio, position: .unspecified)
        return discovery.devices.compactMap { device in
            guard let id = deviceID(forUniqueID: device.uniqueID) else { return nil }
            return InputDevice(id: id, name: device.localizedName, isBluetooth: isBluetoothTransport(id))
        }
    }

    /// The `AVCaptureDevice` behind an `AudioDeviceID` `pickInput` chose — round-tripped
    /// through the device's CoreAudio UID, since `AVCaptureDeviceInput` needs the capture
    /// object, not the id `pickInput`'s policy reasons about.
    private static func captureDevice(forID id: AudioDeviceID) -> AVCaptureDevice? {
        guard let uid = deviceUID(for: id) else { return nil }
        let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external],
                                                         mediaType: .audio, position: .unspecified)
        return discovery.devices.first { $0.uniqueID == uid }
    }

    private static func deviceID(forUniqueID uniqueID: String) -> AudioDeviceID? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyTranslateUIDToDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var uid = uniqueID as CFString
        var deviceID = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = withUnsafeMutablePointer(to: &uid) { uidPtr in
            AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address,
                                       UInt32(MemoryLayout<CFString>.size), uidPtr, &size, &deviceID)
        }
        return (status == noErr && deviceID != kAudioObjectUnknown) ? deviceID : nil
    }

    private static func deviceUID(for id: AudioDeviceID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var uid: CFString? = nil
        var size = UInt32(MemoryLayout<CFString?>.size)
        let status = withUnsafeMutablePointer(to: &uid) {
            AudioObjectGetPropertyData(id, &address, 0, nil, &size, $0)
        }
        return status == noErr ? uid as String? : nil
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
    /// This distinction is the whole point. `AVCaptureDevice.DiscoverySession` comes back
    /// empty in two completely different situations: a machine with no mic, and a machine
    /// with a mic we haven't been granted yet. Using it to decide whether to offer recording
    /// would disable the feature on every Mac that simply hasn't been asked yet. CoreAudio's
    /// default-input property is not gated by privacy, so it answers the hardware question
    /// honestly.
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

/// Bridges `AVCaptureAudioDataOutput`'s delegate callback — fired on our own dedicated queue,
/// never the main thread — to the take's file and meter. Deliberately NOT `@MainActor`
/// (`MacRecorder` is): the callback must not wait on that actor, so this plain `NSObject` owns
/// the write side of the take and only ever reaches back to `MacRecorder` through the
/// `onFirstBuffer`/`onLevel` closures, which themselves hop with `Task { @MainActor in }` —
/// exactly like the old tap closure this replaces.
private final class SampleSink: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private static let log = Logger(subsystem: "com.skrift.desktop", category: "record")

    private let destination: URL
    private let onFirstBuffer: (AVAudioFormat) -> Void
    private let onLevel: (Float) -> Void
    private var file: AVAudioFile?

    init(destination: URL,
         onFirstBuffer: @escaping (AVAudioFormat) -> Void,
         onLevel: @escaping (Float) -> Void) {
        self.destination = destination
        self.onFirstBuffer = onFirstBuffer
        self.onLevel = onLevel
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pcm = Self.pcmBuffer(from: sampleBuffer) else { return }
        if file == nil {
            // THE rule from RESEARCH_MIC §iii, made structural: settings — and the exact PCM
            // shape the file is opened to accept — come from the format THIS buffer actually
            // arrived in, never a value read before the session started running.
            do {
                file = try AVAudioFile(forWriting: destination,
                                       settings: RecordingCore.encoderSettings(for: pcm.format),
                                       commonFormat: pcm.format.commonFormat,
                                       interleaved: pcm.format.isInterleaved)
                onFirstBuffer(pcm.format)
            } catch {
                Self.log.error("first buffer: could not open the file — \(String(describing: error), privacy: .public)")
                return
            }
        }
        do {
            try file?.write(from: pcm)
        } catch {
            Self.log.error("write failed: \(String(describing: error), privacy: .public)")
        }
        onLevel(RecordingCore.level(pcm))
    }

    /// One delivered buffer, converted from Core Media's wire format to the PCM buffer
    /// everything downstream already understands (`RecordingCore.level`, `AVAudioFile.write`).
    /// `nil` on anything CoreMedia can't describe as PCM — dropped rather than crashing on a
    /// malformed sample.
    ///
    /// `AVAudioPCMBuffer(pcmFormat:frameCapacity:)` allocates its OWN correctly-shaped storage
    /// (the right number of channel buffers for `format`, interleaved or not) and owns it via
    /// normal ARC — deliberately not the zero-copy `bufferListNoCopy` initializer, which would
    /// hand back a bare `AudioBufferList` header sized for exactly one channel (Swift's
    /// imported struct has room for one `AudioBuffer`) and require us to hand-manage that
    /// header's memory for as long as the PCM buffer lives. A non-interleaved stereo mic would
    /// need two buffer slots; getting that lifetime wrong by hand is a worse bug than the copy
    /// this avoids paying for.
    private static func pcmBuffer(from sampleBuffer: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return nil }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription),
              let format = AVAudioFormat(streamDescription: asbd) else { return nil }
        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount))
        else { return nil }
        buffer.frameLength = AVAudioFrameCount(frameCount)
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer, at: 0, frameCount: Int32(frameCount), into: buffer.mutableAudioBufferList)
        guard status == noErr else { return nil }
        return buffer
    }
}

private extension FileManager {
    func attributeOfItemSize(at url: URL) throws -> Int {
        (try attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }
}
