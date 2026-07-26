# Kickoff — audio-session round (record-start latency + the book losing the route)

Written 2026-07-25 from a **remote session with no Swift toolchain**: everything below was
diagnosed by reading the code, and the instrumentation is committed but **never compiled**.
Branch: `claude/recording-audio-player-issues-dlahf5`.

Full triage: `backlog.md` → "🔊 CONTINUE HERE — audio-session round".

---

## Step 0 — make it build (do this first)

```
cd Skrift_Native/SkriftMobile && xcodegen generate
xcodebuild test -scheme SkriftMobile -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build
```

Two files changed, instrumentation only (`DevLog.log` + `Date()` stamps, no behaviour change):
- `Services/Recording/LiveRecordingService.swift`
- `Services/Audiobooks/AudiobookSession.swift`

**Riskiest line:** `AVAudioSessionInterruptionReasonKey` in
`AudiobookSession.installInterruptionObserverIfNeeded` (iOS 14.5+). If the compiler disagrees,
drop that one field from the log line — nothing else depends on it.

Then build + install the **Dev** build to the device (DevLog is DEBUG-only, so a prod build
produces no trace at all):

```
xcodebuild build -scheme SkriftMobile -destination 'platform=iOS,id=00008110-001208C902EA201E' \
  -derivedDataPath build-device -allowProvisioningUpdates DEVELOPMENT_TEAM=9W82X49JZS CODE_SIGN_STYLE=Automatic
xcrun devicectl device install app --device 00008110-001208C902EA201E \
  build-device/Build/Products/Debug-iphoneos/SkriftMobile.app
```

---

## Step 1 — get the numbers (device, AirPods ON — that's the case that hurts)

Ask Tuur for one short run in **Skrift Dev**:
1. Open the recorder ~3× with AirPods connected, ~3× on the speaker.
2. Play a book while Deezer/Spotify is playing, and let it run — try to catch a drop.
3. Do one **audiobook quote capture** (play a book → capture → record a ramble → stop) and note
   what's playing afterwards. *(Predicted: Deezer resumes, the book does not. If that reproduces,
   it may be the entire second report.)*

Pull the trace:

```
xcrun devicectl device copy from --device 00008110-001208C902EA201E \
  --domain-type appDataContainer --domain-identifier com.skrift.mobile.dev \
  --source "Documents/devlog.txt" --destination ./devlog-audio.txt
```

**What to read for:**

| Line | Tells you |
| --- | --- |
| `start LIVE after N attempt(s) — tap-to-live=Xms` | the number the user actually feels |
| `engine started — … cat=… activate=… node=… file=… tap=… engine=… TOTAL=…` | which stage owns it |
| `start refused — input format not ready … burned=…ms` | retry amplification (each one costs +300 ms *plus* a full re-setup) |
| `audiobook interruption BEGAN/ENDED … shouldResume=` | whether an interruption is what killed playback |
| `audiobook SILENT STOP — timeControlStatus=…` | AVPlayer stopped with no callback (the invisible case) |
| `audiobook end-of-book pause — time=… >= duration=…` | false end-of-book from bad metadata |
| `record stop — releasing the audio session WHILE a book session is active` | the quote-capture handback |
| `audiobook route change — reasonRaw=…` | 2=oldDeviceUnavailable, 3=categoryChange, 6=routeConfigurationChange |

---

## Step 2 — the fixes, in the order the evidence justifies

### A. Record start (`LiveRecordingService.startEngine`)

Expected profile: `cat=` dominates on AirPods (`.allowBluetooth` = legacy **HFP**, so activating
forces an A2DP→HFP flip), and `start refused` retries multiply it because each retry redoes
`setCategory` + `setActive` from scratch.

1. **Pre-warm** — configure `.playAndRecord` + `setActive(true)` when the recorder is about to
   appear (or at touch-down on the record button), so `start()` only builds the engine + tap.
2. **Don't rebuild per retry** — keep the session configured; re-query only the input format.
3. **Reconsider `.allowBluetooth`** — HFP is only needed when the AirPods are the *mic*.
   `.allowBluetoothA2DP` is output-only and cheap.
4. **Move `startEngine` off the main actor** so the UI stays live during bring-up.
5. **UI:** make the starting state visually continuous with the recording state — the ideal outcome
   is that "Starting…" never appears as a distinct screen. (`RecordView.startingContent`.)

⚠️ Per CLAUDE.md: this is hardware-flavoured. Diagnose from the trace, fix directly (no lanes),
re-pull the trace to confirm `tap-to-live` actually dropped.

### B. Audiobook keeping the route (`AudiobookSession`)

1. **Handle interruption `.ended`** — the clear gap today. Latch `pausedByInterruption = true` in
   the `.began` branch; on `.ended` with `.shouldResume`, re-activate the session and resume **only
   if that latch is set** (so a user-initiated pause is never auto-resumed). Clear the latch in
   `play()`/`pause()`.
2. **Quote-capture handback** — after the ramble recorder stops, the paused book should get the
   route back, not Deezer. Either skip `.notifyOthersOnDeactivation` in
   `LiveRecordingService.stop()` when a book session is active, or have the capture flow re-activate
   and resume the book on dismiss.
3. **Silent stop** — if `timeControlStatus != .playing` while `isPlaying`, recover (re-activate +
   `playImmediately`) instead of sitting silent; the detector is already in `tick()`.
4. **False end-of-book** — only trip the `time >= duration - 0.25` guard when we're on the LAST
   file, or trust the item's own duration over stored metadata.
5. **Now Playing ownership** (Tuur's Spotify-vs-Deezer point) — set
   `MPNowPlayingInfoCenter.default().playbackState`, and explicitly disable the remote commands we
   don't handle (`nextTrackCommand`, `previousTrackCommand`).

---

## Step 3 — close out

- Tick the items in `backlog.md` → "🔊 CONTINUE HERE — audio-session round" **in the same session**.
- Update `FEATURES.md` if any behaviour changes.
- Update `roadmap/roadmap.yaml` in the same commit (flip/add the node, keep exactly one `now`).
- Archive this file to `archive/handoffs/` once the round is done.
