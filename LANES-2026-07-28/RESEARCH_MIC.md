# macOS mic capture research — recommendation memo

Context read: `Skrift_Native/SkriftDesktop/Engines/MacRecorder.swift` (AVAudioEngine +
`kAudioOutputUnitProperty_CurrentDevice` on `inputNode.audioUnit`, format read via
`input.inputFormat(forBus:)` after the property-set, tap installed, `AVAudioFile` written).
Also read `Shared/Recording/RecordingCore.swift` (encoder settings, level meter, m:ss).

## (i) Architecture decision

**Move off `AVAudioEngine.inputNode` for device-targeted capture. Use `AVCaptureSession` +
`AVCaptureDeviceInput(device:)` + `AVCaptureAudioFileOutput`, with `AVCaptureConnection
.audioChannels[].averagePowerLevel` for the meter.**

Why: `AVAudioEngine.inputNode` and `.outputNode` share **one `AUAudioUnit` instance**
defaulting to the system output device (confirmed by Apple engineers on the dev forums,
and independently reproduced by other developers as "0 ch / 0 Hz after `setDeviceID`").
Reassigning its `CurrentDevice` from outside AVAudioEngine's own state machine is poking a
private implementation detail the engine was never told about — the engine's cached node
format, its render-graph expectations, and the actual HAL device can end up disagreeing,
which is exactly the class of bug that produces "0 buffers" and "buffers full of the wrong
byte layout." `AVCaptureSession` is the API Apple actually built for device-targeted,
to-file audio capture: it takes a specific device by construction, gives you free
disconnect/interruption notifications, and needs noticeably less code than hand-rolling a
second AUHAL instance (which is what OBS and WebRTC do, but they need cross-platform
low-latency raw PCM streaming — Skrift just needs one clean AAC file plus a meter).
Reserve raw AUHAL as a fallback only if `AVCaptureAudioFileOutput`'s format/channel-layout
constraints prove too rigid in practice (see caveat in §iii).

## (ii) Exact API sequence (AVCaptureSession path)

```swift
// 1. Enumerate — AVCaptureDevice.DiscoverySession, NOT AVAudioEngine/CoreAudio-only calls,
//    when you want an object you can hand straight to AVCaptureDeviceInput.
let discovery = AVCaptureDevice.DiscoverySession(
    deviceTypes: [.microphone, .external], mediaType: .audio, position: .unspecified)
let devices = discovery.devices   // .isConnected / .isSuspended per device

// 2. Pick — Skrift's existing wired>BT policy runs here unchanged (CoreAudio transport-type
//    check stays; only the "which API records" step changes).
let chosen = pickInput(from: devices, systemDefault: ...)

// 3. Build the session BEFORE touching format — order matters less here than in AVAudioEngine
//    because AVCaptureSession negotiates format internally once inputs/outputs are attached.
let session = AVCaptureSession()
session.beginConfiguration()
let input = try AVCaptureDeviceInput(device: chosen)
guard session.canAddInput(input) else { throw ... }
session.addInput(input)

let fileOutput = AVCaptureAudioFileOutput()
guard session.canAddOutput(fileOutput) else { throw ... }
session.addOutput(fileOutput)
session.commitConfiguration()

// 4. Metering — read AFTER addInput/addOutput, from the connection, not the device.
let levels = fileOutput.connection(with: .audio)?.audioChannels
    .map { $0.averagePowerLevel } ?? []

// 5. Start + record to file. outputSettings takes the same AAC dict RecordingCore already
//    builds (kAudioFormatMPEG4AAC / sampleRate / channels) — encoderSettings(for:) is reusable
//    almost as-is, just sourced from the AVCaptureDevice's active format instead of an
//    AVAudioFormat.
session.startRunning()
fileOutput.startRecording(to: dest, outputFileType: .m4a, recordingDelegate: self)

// 6. Meter loop: poll audioChannels[].averagePowerLevel on your own Timer at whatever cadence
//    RecordingCore.Meter wants (it already expects push-driven samples, not per-buffer callbacks
//    — this maps cleanly, arguably more cleanly than the current tap-driven push).

// 7. Device loss / disconnect — observe, don't poll:
NotificationCenter.default.addObserver(
    forName: .AVCaptureDeviceWasDisconnected, object: nil, queue: .main) { note in
    guard (note.object as? AVCaptureDevice) == chosen else { return }
    // stop cleanly, surface the SAME "nothingCaptured(deviceName)" refusal already modeled
}
NotificationCenter.default.addObserver(
    forName: .AVCaptureSessionRuntimeError, object: session, queue: .main) { note in
    // session-level failure (format renegotiation failure, device yanked mid-run, etc.)
}

// 8. Device switch mid-session — beginConfiguration(); removeInput(old); addInput(new);
//    commitConfiguration(). AVCaptureSession is explicitly designed to be reconfigured live;
//    AVAudioEngine is not (see §iii — full engine teardown/rebuild is the only thing that
//    reliably works there).
```

Where format is read: **after `addInput`**, from the capture connection — never from the
raw device before it's attached to a session, mirroring TN2091's rule for AUHAL ("read
device format only after the unit is wired up, and read it from the side that reflects
the live negotiation, not a cached snapshot").

## (iii) Why the current AVAudioEngine approach produces silence/garbage

1. **Shared AUAudioUnit.** `inputNode.audioUnit === outputNode.audioUnit` on macOS,
   defaulting to the speaker device. Poking `kAudioOutputUnitProperty_CurrentDevice` on it
   changes a unit AVAudioEngine believes it already understands — not a documented,
   supported reconfiguration path.
2. **Format is cached, not live.** Multiple independent reports (dev forums) show
   `inputFormat(forBus:)` — or the lower-level `auAudioUnit` format — going to **0 ch / 0
   Hz**, or staying at the pre-switch value, immediately after a `CurrentDevice` set. TN2091
   (the canonical AUHAL guide, still the ground truth even though it predates
   AVAudioEngine) is explicit that IO must be enabled *before* the device is set, and the
   format must be read from the correct scope *after* the switch has actually taken effect
   — `AVAudioEngine`'s convenience wrapper doesn't guarantee that ordering or that settle
   time for you.
3. **This is a plausible root cause for both observed symptoms:**
   - **(a) ≤1KB / zero buffers:** the tap was installed with a format the engine's graph
     considered valid but the actual HAL device wasn't yet delivering against (a race
     between `AudioUnitSetProperty` returning and the device's IOProc actually starting at
     the new format) — the render callback fires close to zero times before `stop()`.
   - **(b) garbage/`invalidAudioData`:** the AVAudioFile was created with encoder settings
     derived from a format snapshot that didn't match the bytes actually delivered per
     buffer (old default's 24 kHz description vs. the USB mic's real 48 kHz stream, or a
     channel-count mismatch) — every frame then gets byte-reinterpreted at the wrong
     stride, which is indistinguishable from noise to the ASR.
4. **No supported "just switch it" API exists.** Every developer report that reaches a
   *working* fix does so by discarding the whole `AVAudioEngine` and building a fresh one
   post-switch — `engine.reset()` and disconnect/reconnect are both reported as
   insufficient. Apple's own docs warn the engine must not even be deallocated from inside
   its own `AVAudioEngineConfigurationChangeNotification` handler, which is a strong signal
   this whole surface is not meant for live device reassignment.
5. **Hog mode is very unlikely to be the cause.** `kAudioDevicePropertyHogMode` defaults to
   "unowned" (shared) — normal concurrent capture by two apps on one device is the common
   case and Apple supports it. The one adjacent gotcha: another app running **Voice
   Processing I/O** on the same device can force a format/rate change that disrupts
   co-resident non-VPIO clients — worth ruling out on the "other recording app" but not
   the primary suspect here; the AVAudioEngine device-switch race above is the more direct
   explanation for both symptoms together.

## (iv) UX recommendation

**Auto-pick by default, follow the live system default, with Skrift's existing
wired-over-Bluetooth override as the only exception — no manual picker required for v1.**
This matches the dominant convention (Discord, Zoom, Teams all default to "System
Default" / "Same as System" and only show a manual dropdown for power users who explicitly
open settings). None of them do proactive "smart" re-picking beyond that — Skrift's
BT-avoidance rule is a deliberate, justified departure (a sleeping HFP mic is a failure
mode generic apps don't specifically guard against), so keep it, but keep it *narrow*:
only override when the system default itself is Bluetooth AND a wired alternative exists,
exactly as the current `pickInput` already does. Discord's own behavior when the OS
default changes mid-call is inconsistent/buggy by its own users' report — that's a
reason to implement the system-default-changed listener (`kAudioHardwarePropertyDefaultInputDevice`
address, or `AVCaptureDeviceWasConnected/Disconnected` for hot-plugs) deliberately rather
than copying Discord's approach uncritically. A manual override picker is worth adding
later as a Settings escape hatch, not a blocker for the core fix.

## (v) Sources

- [AVAudioEngine device selection — Apple Developer Forums (kAudioOutputUnitProperty_CurrentDevice pattern, aggregate-device workaround)](https://developer.apple.com/forums/thread/71008)
- [AVAudioEngine. Select input device on macOS — Apple engineer reply recommending AVCaptureSession](https://developer.apple.com/forums/thread/775015)
- [AVAudioEngine — output format has 0 channels after changing device of inputNode's auAudioUnit](https://developer.apple.com/forums/thread/683348)
- [Change Audio input programmatically doesn't change Audio engine input — full engine rebuild is the working fix](https://developer.apple.com/forums/thread/730600)
- [AudioKit/AudioKit#2130 — "AVAudioEngine wasn't designed for us to reach around it down to CoreAudio and change the audio devices"](https://github.com/AudioKit/AudioKit/issues/2130)
- [TN2091: Device input using the HAL Output Audio Unit — canonical AUHAL init order, EnableIO-before-CurrentDevice, format-is-read-only-per-scope rule](https://developer.apple.com/library/archive/technotes/tn2091/_index.html)
- [AVCaptureAudioFileOutput — Apple Developer Documentation](https://developer.apple.com/documentation/avfoundation/avcaptureaudiofileoutput)
- [AVCaptureConnection.audioChannels / AVCaptureAudioChannel.averagePowerLevel — Apple Developer Documentation](https://developer.apple.com/documentation/avfoundation/avcaptureaudiochannel)
- [AVCaptureDevice.DiscoverySession — Apple Developer Documentation](https://developer.apple.com/documentation/avfoundation/avcapturedevice/discoverysession)
- [How to observe AVCaptureDevice.DiscoverySession / disconnect notifications](https://developer.apple.com/forums/thread/766106)
- [OBS Studio mac-capture/mac-audio.c — raw CoreAudio AUHAL, own AudioComponent instance, format read via kAudioUnitProperty_StreamFormat on SCOPE_OUTPUT/BUS_INPUT after device set](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-capture/mac-audio.c)
- [WebRTC audio_device_mac.cc — AUHAL via its own audio unit, not AVAudioEngine](https://webrtc.googlesource.com/src/webrtc/+/refs/heads/master%5E/modules/audio_device/mac/audio_device_mac.cc)
- [Rogue Amoeba ARK-SDK / ACE — CoreAudio server-plugin-based capture backend behind Audio Hijack & Loopback](https://rogueamoeba.com/support/knowledgebase/?showArticle=Misc-ARK-Audio-Capture-Details&product=Audio+Hijack)
- [Voice Processing in multiple apps simultaneously — Apple Developer Forums (adjacent shared-device gotcha)](https://developer.apple.com/forums/thread/751100)
- [Discord: input device follows system default unless manually overridden — How-To Geek](https://www.howtogeek.com/663414/how-to-configure-your-microphone-and-headset-in-discord/)
- [miniaudio license (public domain / MIT-0 dual)](https://github.com/larpon/miniaudio/blob/master/LICENSE)
- [PortAudio license (MIT/Expat)](https://www.portaudio.com/license.html)
- [AudioKit license (MIT)](https://github.com/AudioKit/AudioKit/blob/main/LICENSE)
- WebRTC ADM: BSD-3-Clause (Chromium/WebRTC project license, well-established, not separately fetched this session)
- OBS Studio: GPLv2 — patterns-only reference, no code reuse
