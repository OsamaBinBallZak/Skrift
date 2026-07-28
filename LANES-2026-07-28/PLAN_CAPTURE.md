# PLAN — lane CAPTURE

Base 7e74aad. Rebuild `MacRecorder`'s capture core on `AVCaptureSession` per
`BRIEF_CAPTURE.md` (all 8 points pinned there). This file records the concrete design so the
conductor can review the choices at merge, not to restate the brief.

## Architecture (brief #1: data-output variant, not file-output)

`AVCaptureSession` + `AVCaptureDeviceInput(device:)` + `AVCaptureAudioDataOutput`. The
data-output's `audioSettings` requests `Float32`, non-interleaved PCM (bit depth 32,
`AVLinearPCMIsFloatKey`/`AVLinearPCMIsNonInterleavedKey`) but **omits sample rate and channel
count** — those stay whatever the device negotiates, so the first delivered `CMSampleBuffer`'s
format is the live, real one (never a value read before capture ran). Float32/non-interleaved
is required, not optional: `RecordingCore.level()` reads `floatChannelData?[0]` assuming
non-interleaved float samples — an interleaved stereo buffer would alias two channels into one
RMS read.

A private `SampleSink: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate` — deliberately
NOT `@MainActor` — owns the write side of the take. It converts each `CMSampleBuffer` to
`AVAudioPCMBuffer` via `CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer` +
`AVAudioPCMBuffer(pcmFormat:bufferListNoCopy:deallocator:)` (zero-copy view; the deallocator
closure keeps the retained `CMBlockBuffer` alive exactly as long as the view). `MacRecorder`
reaches into it only via `Task { @MainActor in }` hops on `onFirstBuffer`/`onLevel` closures —
same shape as the old tap closure's `Task { @MainActor in self?.meter.push(...) } }`.

## First-buffer file rule (brief #2)

`SampleSink.captureOutput` opens the `AVAudioFile` lazily on its first buffer, via
`AVAudioFile(forWriting:settings:commonFormat:interleaved:)` — `settings` from
`RecordingCore.encoderSettings(for: pcm.format)`, `commonFormat`/`interleaved` copied from that
same buffer's own `AVAudioFormat`. This makes a stale/mismatched format unrepresentable: the
file is always opened to match what's actually arriving, never a cached snapshot.

## Frozen surface (brief #3) — unchanged signatures

`state`/`State`/`Refusal` (all cases, `message`, `fixedInPrivacySettings`,
`privacySettingsURL`), `isRecording`, `elapsed`, `elapsedLabel`, `meter`, `start() async ->
Bool`, `stop() -> URL?` (stays SYNCHRONOUS — the data-output path makes this possible, so the
sidebar call site needs no change), `cancel()`, `clearFailure()`, `hasInputDevice`, `pickInput`,
`InputDevice`.

`.noUsableFormat` is repurposed rather than orphaned: it now fires when `pickInput` succeeds
(hardware says a default input exists) but either (a) `AVCaptureDevice.DiscoverySession` has no
matching device, or (b) the chosen `AudioDeviceID` can't be translated to one — "a device
exists but we can't get a usable capture object from it," same spirit as the old "0 Hz format"
case, same message.

## Device policy + enumeration (brief #4)

`InputDevice` stays a plain `AudioDeviceID`-keyed struct; `pickInput`'s wired-over-BT rule is
untouched. `inputDevices()` now sources from `AVCaptureDevice.DiscoverySession(deviceTypes:
[.microphone, .external], mediaType: .audio, position: .unspecified)`, translating each
device's `uniqueID` → `AudioDeviceID` via `kAudioHardwarePropertyTranslateUIDToDevice` (chosen
over `AVCaptureDevice.transportType` so the existing, proven `isBluetoothTransport` CoreAudio
check is reused unchanged). The reverse lookup (`AudioDeviceID` → `AVCaptureDevice`, needed to
build the `AVCaptureDeviceInput` for the device `pickInput` chose) goes `AudioDeviceID` →
`kAudioDevicePropertyDeviceUID` → match against `DiscoverySession.devices` by `uniqueID`. Two
enumeration passes (pick, then resolve) — simple, no new cached state, acceptable cost for a
call that happens once per `start()`.

`hasInputStreams(_:)` and `deviceName(_:)` are deleted — the DiscoverySession device types
already restrict to audio-input-capable devices, and `AVCaptureDevice.localizedName` replaces
the CoreAudio name lookup.

## Threading (brief #5)

Two dedicated serial queues: `configQueue` for `session.startRunning()` /
`session.stopRunning()` (both dispatched `.async`, never `.sync` from Main — main never waits
on the session), `callbackQueue` for the sample delegate. `state`/`meter`/`elapsed` stay
`@MainActor`, hopped to exactly as today.

## Fail-fast (brief #6) + a generation guard

Pure decision function: `static func shouldFailFast(elapsedSinceStart:hasReceivedBuffer:) ->
Bool` (`elapsed >= 1.5 && !hasReceivedBuffer`) — testable without a clock. Wired via a `Task {
try? await Task.sleep(...) }` scheduled at `start()`.

New: `takeGeneration` counter, incremented per `start()`. The fail-fast task and the
`SampleSink` closures all check their captured generation against the current one before
mutating state. Without this, a quick Record→Stop→Record cycle under 1.5s would let the FIRST
take's fail-fast timer fire during the SECOND take and kill it. Not explicitly in the brief but
a correctness bug the new async structure introduces that the old synchronous-tap version
didn't have — flagging in the wrap block, not escalating (mechanical fix, no doctrine call).

## Mid-take device loss (brief #7)

`.AVCaptureDeviceWasDisconnected` (object = the chosen device) and `.AVCaptureSessionRuntimeError`
(object = the session) are observed. On either: tear down the session/observers and freeze the
ticker (a torn-down session must not keep counting). If `sawSignal` is false, finalize
immediately as a dead take (`.nothingCaptured`/`.engineFailed`) — nothing to lose. If
`sawSignal` is true, **leave `state == .recording` and the file/url in place** — the frozen
enum has no "finished-but-uncollected" case to move to, so survival means the take stays live
until the next `stop()` call runs the normal finalize path and returns it. This is "return it
from the next `stop()`," read literally.

## Kept (brief #8)

TCC flow + `Refusal` mapping, `Logger` category `record` (now also logging: chosen device at
pick time, session-configured/dispatching-start, FIRST BUFFER arrival + its live format, the
disconnect/runtime-error event), stop verdicts, `hasInputDevice`.

## Tests (extend `MacRecorderRefusalTests.swift` — touching only the classes that test
`MacRecorder`; `LocalRecordingFloorTests`/`RecordingMemoIdentityTests` are untouched, they test
other lanes' files)

- `InputPickTests` — untouched, must still pass unchanged.
- New: fail-fast pure-function tests (trips at ≥1.5s with no buffer; does not trip once a
  buffer arrived, however quiet after).
- New: first-buffer file rule — a synthesized `AVAudioFormat` round-tripped through
  `RecordingCore.encoderSettings` (rate + channel count preserved), plus an
  `AVAudioFile(forWriting:settings:commonFormat:interleaved:)` + `write(from:)` round-trip
  proving the exact mechanism `SampleSink` uses doesn't throw.
- Extend `testEveryRefusalCarriesADistinctNonEmptyMessage`'s `all` array to include
  `.nothingCaptured`/`.recordedSilence` so the FULL 7-case set is checked for distinctness, not
  just 5 of 7.

## Verify

No xcodebuild (EDIT-ONLY per playbook). Care + the conductor's compile gate.
