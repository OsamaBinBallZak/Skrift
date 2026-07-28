# Brief — lane CAPTURE (rebuild the Mac recorder on AVCaptureSession)

Playbook: `LANE_PLAYBOOK.md` (read first, follow exactly). Base + ownership: `LANES-2026-07-28/BASE.md`.
Research: `LANES-2026-07-28/RESEARCH_MIC.md` — read it; its §iii is why your work exists.

## The feature

`MacRecorder` captures silence/garbage when pointed at a non-default input: setting
`kAudioOutputUnitProperty_CurrentDevice` on `inputNode.audioUnit` pokes an audio unit that
`inputNode` and `outputNode` SHARE on macOS — unsupported, and the format it reports goes
stale/0 Hz (RESEARCH_MIC §iii; both real-machine symptoms match). Rebuild the capture core on
`AVCaptureSession` + `AVCaptureDeviceInput`, which takes a specific device by construction.
All decisions below are PINNED.

1. **Architecture: `AVCaptureSession` + `AVCaptureDeviceInput` + `AVCaptureAudioDataOutput`
   → the EXISTING `AVAudioFile`/`RecordingCore` write+meter path.** The research memo's
   primary suggestion was `AVCaptureAudioFileOutput`; we deliberately take the data-output
   variant because it preserves three things the file-output can't: the synchronous
   `stop() -> URL?` surface (another lane owns the call site), the phone-parity meter
   (`RecordingCore.level` on real PCM — Shared, read-only, the two apps' waveforms must move
   alike), and exact-zero `sawSignal` detection. FALLBACK: if CMSampleBuffer→PCM proves
   intractable, `AVCaptureAudioFileOutput` is permitted — document why in your wrap block,
   map the meter from `averagePowerLevel` dB in a pure tested function, and note that
   `stop()` becomes async (the conductor adapts the call site at merge; you still must not
   touch the sidebar).
2. **The file is born from the FIRST DELIVERED buffer.** Create the `AVAudioFile` lazily in
   the data-output callback, with `RecordingCore.encoderSettings(for:)` derived from that
   buffer's OWN format — never from a format read before capture ran. This is TN2091's
   "read the live negotiated format" rule made structural: the stale-format class of bug
   becomes unrepresentable.
3. **Public surface is FROZEN** (the sidebar reads it and is another lane's file):
   `state`/`State`/`Refusal` (all cases + `message` + `fixedInPrivacySettings` +
   `privacySettingsURL`), `isRecording`, `elapsed`, `elapsedLabel`, `meter`,
   `start() async -> Bool`, `stop() -> URL?`, `cancel()`, `clearFailure()`,
   `hasInputDevice`, `pickInput`, `InputDevice`. Internals are yours.
4. **Device policy stays, enumeration moves.** `pickInput`'s wired-over-BT rule and its
   tests survive; populate `InputDevice` from `AVCaptureDevice.DiscoverySession`
   (`.microphone`, `.external`). Keep `InputDevice` a plain struct (constructible in
   host-less tests — `AVCaptureDevice` is not). Bluetooth classification: either macOS
   `AVCaptureDevice.transportType` or translate `uniqueID` → `AudioDeviceID` and reuse the
   existing CoreAudio check — your choice, name it in the wrap block.
5. **Threading.** `startRunning`/configuration on a dedicated serial queue (it blocks);
   sample callback on its own queue; `state`/`meter`/`elapsed` published from `@MainActor`
   hops exactly as today. The main thread must never wait on the session.
6. **Fail fast.** No buffer delivered within 1.5s of a started session → stop, verdict
   `.nothingCaptured(deviceName)` — the user must not talk into a dead take until they
   press stop. Express the rule as a pure decision function and test it.
7. **Mid-take device loss.** Observe `.AVCaptureDeviceWasDisconnected` (+ session runtime
   error): finalize the file; if it holds signal, the take SURVIVES (return it from the next
   `stop()` or end the take as stopped — captured words beat a clean error); if it holds
   nothing, the existing dead-take verdict fires. Say which in your wrap block.
8. **Keep:** the TCC request flow and `Refusal` mapping; the `Logger` gates (category
   `record`) — add the chosen device, session start, FIRST-BUFFER arrival with its live
   format, and the disconnect event; the stop verdicts (`nothingCaptured`/`recordedSilence`);
   `hasInputDevice` (CoreAudio, TCC-free).

## Tests (extend `MacRecorderRefusalTests.swift`)
- `pickInput` suite survives the enumeration change untouched (that's the point of the
  plain struct).
- First-buffer file rule: settings derived from a synthesized `AVAudioFormat` round-trip
  through `RecordingCore.encoderSettings` (rate + channel count preserved).
- Fail-fast decision function: no-buffers-at-1.5s trips; buffers-then-quiet does not.
- Every `Refusal` still distinct + device-naming cases still name the device.

## Verify
No xcodebuild (playbook). Swift care + conductor's compile gate. Wrap block per playbook.
