# Live-caption settle policy — research memo

Context read: `Skrift_Native/Shared/Recording/LiveCaptionEngine.swift`,
`Skrift_Native/SkriftDesktop/Features/Shell/LiveRecordingSession.swift`,
`Skrift_Native/Shared/Pipeline/AlignmentCore.swift`, `Skrift_Native/Shared/Pipeline/Karaoke.swift`.

## i. What Apple's finalization actually keys on

- **Legacy `SFSpeechRecognizer`**: undocumented publicly. Confirmed behavior: it delivers
  `SFTranscriptionSegment`s with `timestamp = 0.0` until a batch finalizes, then real
  timestamps land and the *next* partial result no longer includes those segments — i.e.
  a hard, one-way commit boundary, same shape as our `committedChunks`. No official word on
  the exact VAD/time/confidence trigger.
- **iOS 26 `SpeechAnalyzer`/`SpeechTranscriber`** (WWDC25 session 277): delivers an
  `AsyncSequence` of results, each either `volatile` (light-opacity, replaced) or
  `isFinal` (never replaced again — "once finalized... moves on to the next range").
  Apple's own words on the trigger: finalization happens once "the model improves its
  transcription as it gets more audio with more context" — deliberately vague, no published
  ms/VAD-threshold number. A separate `SpeechDetector` module ships alongside as pure VAD,
  meant to gate when the analyzer even runs, not documented as the literal finalize signal
  but clearly the pairing Apple intends (VAD decides *when to try*, the analyzer's own
  confidence/context decides *what's stable*).
- **Retro-rewrite distance**: not documented, but the mechanism as described is
  one-directional — a finalized range is never revisited. This matches (and validates)
  Skrift's own settled/wet split; we didn't invent something naive.
- **Edit-while-recognizing**: Apple doesn't document this either, but the observed/reported
  UX (Apple Support + user threads) is that the on-screen **keyboard stays available while
  the mic is live** (since ~iOS 16/18) — so backspacing/retyping is a genuine manual edit of
  already-produced text, with recognition continuing to *insert new text wherever the cursor
  currently is*. There's no evidence Apple re-derives recognition context from the edited
  text — it just keeps appending. That is functionally identical to Skrift's own rule
  ("the engine may only APPEND to settledText, never rewrite it") — independently arrived at,
  now corroborated rather than novel.

## ii. Ranked upgrades to our settle policy

Current shape: whole-window re-transcribe every self-paced poll (~0.6–6s on M4); the ONLY
settle event is `rotateIfNeeded`, gated by a flat `rotationInterval` (now 7s) or an
early-rotate once snapshot cost > 1.2s past 10s.

| # | Policy | Effort | Premature-commit risk | Felt impact |
|---|---|---|---|---|
| a | Shorten the fixed interval further (7s→~3-4s) | Trivial (1 constant) | **Rises** as interval shrinks — mid-clause commits become likely | Low ceiling — still a wall-clock countdown, not a speech boundary |
| b | **Pause/VAD-triggered rotation**, fixed interval demoted to a ceiling/fallback | Low-Medium — one RMS/hangover gate over the buffer we already own in `feed()`, no ML model | Low — commits land at natural phrase/silence boundaries, same shape as Apple's own dictation and every local whisper.cpp-based dictation tool (superwhisper/MacWhisper-class) | **High** — this is the literal difference between "wall-clock paragraph dump" and "Apple-like" settling |
| c | Agreement-based settle (LocalAgreement-2 style): promote to committed only once 2 consecutive snapshots produce the same prefix, decoupled from audio rotation | Medium — a small pure longest-common-prefix/word-diff function (same shape as the existing n-gram anchor code in `AlignmentCore`), plus a "settled-but-not-rotated" bookkeeping state | **Lowest** — a wrongly-guessed word must reproduce itself twice before becoming the user's editable problem | Medium-High — directly answers "wrongly-settled words become the user's problem," costs ~1 extra poll cycle (~0.6-2s) of latency |
| d | **(b) + (c) combined** | Additive over (b) and (c), no new dependency | Lowest of all options | Highest |

**Recommended next step, stated plainly: build (b) alone first** — an RMS/hangover silence
gate that triggers rotation at a detected pause, with the current fixed interval kept only
as the ceiling (exactly how production streaming stacks treat fixed windows: fallback, not
primary — see Deepgram/Google below). It's the cheapest of the four, touches nothing but
`shouldRotate`'s trigger condition, and is most likely to single-handedly fix Tuur's
complaint since Apple's own dictation settles per-phrase, not per-timer. Layer (c) on top
only if live eyeballing after (b) still shows wrong words going white.

Whisper-family precedent for (b): whisper.cpp's own streaming example is exactly this
shape — "accumulate samples until VAD reports the user has paused, dispatch that chunk...
each chunk transcribes independently" — with practical latency 0.5–2s. That's the same
architecture as our engine (whole-window re-decode per chunk), just with VAD instead of a
timer choosing the chunk boundary — a drop-in swap, not a redesign.

Production systems generally treat VAD/endpointing as the PRIMARY commit signal and fixed
windows as a *safety net*, not the reverse (Deepgram's `endpointing` is VAD/silence-based by
default; Google's streaming API's `single_utterance` is VAD-driven; whisper_streaming is
VAD-chunked). Our current code has this inverted (timer primary, no VAD at all) — (b) simply
brings us in line with how everyone else does it. Notably, the comment already in
`LiveCaptionEngine.swift:231` ("ported from Shhhcribble TextEngine") confirms Skrift's own
ancestor had a VAD speech-end trigger before the phone-era rewrite dropped it for a plain
timer — (b) isn't new territory, it's recovering a capability that already existed once.

## iii. Karaoke-after-edit recommendation

Skrift already owns the exact right tool, just not wired to this case yet:
`AlignmentCore`/`Karaoke.wordTimes(displayedWords:timings:)` (`Shared/Pipeline/Karaoke.swift:40-100`)
is an n-gram-anchor + DP forced-aligner **already used** to align a copy-edited Mac note body
back to raw ASR word timings for read-along — tuned with `anchorN: 1` specifically because
"a displayed body is a *subsequence* of the spoken words" (i.e. built for exactly the
insertion/deletion pattern a mid-take edit produces), and it already fails safe: a
`.rejected` verdict returns `[]` and the caller falls back to flat time-proportion rather than
a confidently-wrong highlight (matches the repo's locked "better no info than bad info" rule).

This is functionally the same move as Descript's "Realign words in a range" / Otter's
post-edit realignment — both treat re-alignment as a deliberate, post-hoc pass over the
edited transcript, not a live-tracking process during the edit itself. Recommendation:
**reuse, don't rebuild** — for an `everEdited == true` live take, run this same
`Karaoke.wordTimes` pass once at finalize time over `settledText + finalTail`'s word
timings (the `finalTail` from `finishParts()` already gets a final-quality transcribe with
timings). Do not attempt live karaoke tracking during the edit itself — no reviewed tool
(Apple, Descript, Otter) does that either; realignment is universally a discrete,
after-the-fact action.

## iv. "Feels right" latency numbers found

- Conversational/voice-agent turn: **<1s** natural, **1-2s** acceptable, **2-3s** noticeable/
  uncertain, **>3s** feels broken (Picovoice/Coval-style latency guidance).
- Live captioning tolerates a looser budget than a live agent turn: **~2000ms** before it
  reads as laggy (vs ~500-800ms target for a conversational agent).
- Wispr Flow (cloud dictation): **~700ms** perceived, sub-1s server-side — praised
  specifically for being under ~1s; degrades hard on bad networks (a lesson: consistency
  matters as much as the mean).
- Local whisper.cpp-family dictation (Superwhisper/MacWhisper-class): practical
  **0.5–2s** from VAD pause-detect to text landing — the closest analog to Skrift (local,
  Apple Silicon, whisper-derived).
- Production endpointing/silence thresholds: **~300-600ms** for barge-in-sensitive voice
  agents; Deepgram's `utterance_end_ms` recommends **≥1000ms** (below that is a no-op, since
  interim results only update ~1/sec); partial/interim updates in Deepgram/Google-class APIs
  land roughly **every 1s**.
- Agreement-based (whisper_streaming, VAD-chunked + LocalAgreement-2, n=2 confirmed best in
  IWSLT2022): **~3.3s mean latency** on English — the accuracy-optimized end of the
  spectrum, i.e. what a 2-snapshot confirmation gate costs.
- Skrift's own poll loop already self-paces to a **0.6s floor** on M4
  (`pollDelay`: `max(0.6, cost*1.5)`, capped 6s) — a VAD-pause trigger riding this loop lands
  in the 0.6-2s band, comfortably inside every range above; adding a 2-snapshot agreement
  gate (option c) would add roughly one more poll cycle before promoting to settled — still
  inside the captioning-tolerant ~2s budget.

## v. Sources

- [Bring advanced speech-to-text to your app with SpeechAnalyzer — WWDC25 session 277](https://developer.apple.com/videos/play/wwdc2025/277/)
- [Apple's New Speech Framework: SpeechAnalyzer vs SFSpeechRecognizer](https://blakecrosley.com/blog/speech-framework-vs-sfspeechrecognizer)
- [WWDC 2025: The next evolution of speech-to-text using SpeechAnalyzer (dev.to)](https://dev.to/arshtechpro/wwdc-2025-the-next-evolution-of-speech-to-text-using-speechanalyzer-6lo)
- [SFSpeechRecognitionResult — Apple Developer Documentation](https://developer.apple.com/documentation/speech/sfspeechrecognitionresult)
- [Turning Whisper into Real-Time Transcription System (whisper_streaming / LocalAgreement-2)](https://arxiv.org/html/2307.14743v2)
- [ufal/whisper_streaming — GitHub](https://github.com/ufal/whisper_streaming)
- [LocalAgreement Backend — WhisperLiveKit DeepWiki](https://deepwiki.com/QuentinFuxa/WhisperLiveKit/3.2-localagreement-backend)
- [Gladia — How to measure latency in speech-to-text (TTFB, Partials, Finals)](https://www.gladia.io/blog/measuring-latency-in-stt)
- [Deepgram — Understanding End of Speech Detection](https://developers.deepgram.com/docs/understanding-end-of-speech-detection)
- [Deepgram — Utterance End docs](https://developers.deepgram.com/docs/utterance-end)
- [Deepgram — Endpointing docs](https://developers.deepgram.com/docs/endpointing)
- [Google Cloud Speech-to-Text — streaming reference (interim results / stability / single_utterance)](https://docs.cloud.google.com/speech-to-text/docs/reference/rpc/google.cloud.speech.v1)
- [whisper.cpp examples/stream README](https://huggingface.co/datasets/echodict/whisper.cpp/blob/main/examples/stream/README.md)
- [Superwhisper vs Wispr Flow — Honest Comparison](https://superwhisper.com/vs/wispr-flow)
- [Wispr Flow vs Superwhisper vs MacWhisper: 2026 Winner Tested](https://spokenly.app/blog/wispr-flow-vs-superwhisper-vs-macwhisper)
- [Descript Help — Realign words in a range](https://help.descript.com/hc/en-us/articles/17506687977997-Realign-words-in-a-range)
- [Descript Help — Troubleshooting transcript alignment issues](https://help.descript.com/hc/en-us/articles/28868974869261-Troubleshooting-transcript-alignment-issues)
- [Otter Help — Edit a conversation (realignment status)](https://help.otter.ai/hc/en-us/articles/360047731754-Edit-a-conversation)
- [Apple Support — Dictate text on iPhone (keyboard stays open during Dictation)](https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios)
- [Voice to Text on iPhone: Full Guide (iOS 26 + Fixes) — spokenly.app](https://spokenly.app/blog/voice-to-text-iphone)
- [Apple Dictation on iPhone Got Worse in 2026 — Medium](https://medium.com/@ryanshrott/apple-dictation-on-iphone-got-worse-in-2026-heres-what-actually-works-d4a0e9bf8d35)
- Picovoice/Coval-style latency-perception guidance (<1s natural / 1-2s acceptable / 2-3s
  noticeable / >3s broken) — surfaced via search aggregation across
  [Picovoice — Speech-to-Text Latency](https://picovoice.ai/blog/speech-to-text-latency/) and
  [Coval — How to Measure Voice AI Latency](https://www.coval.ai/blog/how-to-measure-voice-ai-latency-the-complete-guide/).

## In-repo grounding (not web sources, cited for the recommendation)

- `Skrift_Native/Shared/Recording/LiveCaptionEngine.swift` — the engine itself;
  `shouldRotate` (line 206) is where the VAD-ceiling swap lands; the "ported from
  Shhhcribble TextEngine" comment (line 231) confirms a VAD trigger existed before the
  phone-era rewrite.
- `Skrift_Native/SkriftDesktop/Features/Shell/LiveRecordingSession.swift` — the
  settled/wet ownership contract (`settledText`/`wetText`/`everEdited`), and `finishParts()`
  / `finalTail` (the final-quality transcribe of only the un-rotated tail on an edited take)
  that karaoke-after-edit should hang its input off of.
- `Skrift_Native/Shared/Pipeline/AlignmentCore.swift`, `Skrift_Native/Shared/Pipeline/Karaoke.swift` —
  the existing n-gram-anchor forced-aligner already solving "align edited display text to raw
  ASR timings," directly reusable for live-take karaoke-after-edit rather than building a
  second aligner.
