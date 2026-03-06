import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PipelineFile } from '../../../src/types/pipeline';
import { fetchWithTimeout } from '../../../src/http';
import { API_BASE_URL } from '../../../src/api';

// Timeline token from backend
type TimelineToken = { text: string; start: number; end: number }

// Word timings JSON schema (compact)
interface WordTimings {
  version: string;
  audio: { processed_wav: string; duration_sec: number };
  dtw_model?: string | null;
  segments: { idx: number; start: number; end: number; words: { token_id: number; word: string; start: number; end: number }[] }[];
}

interface Props {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
  onStartSanitisation: (fileId: string) => Promise<void> | void;
}

type SrtSegment = { index: number; start: number; end: number; text: string };

function timecodeToSeconds(tc: string): number {
  const m = tc.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  const hh = parseInt(m[1], 10) || 0;
  const mm = parseInt(m[2], 10) || 0;
  const ss = parseInt(m[3], 10) || 0;
  const ms = parseInt(m[4], 10) || 0;
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function parseSRT(srt: string): SrtSegment[] {
  const blocks = srt.split(/\r?\n\r?\n/);
  const segs: SrtSegment[] = [];
  for (const b of blocks) {
    const lines = b.split(/\r?\n/).filter(Boolean);
    if (lines.length >= 2) {
      const index = parseInt(lines[0], 10) || 0;
      const timing = lines[1];
      const m = timing.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
      if (!m) continue;
      const start = timecodeToSeconds(m[1]);
      const end = timecodeToSeconds(m[2]);
      const text = lines.slice(2).join(' ').trim();
      segs.push({ index, start, end, text });
    }
  }
  return segs.sort((a, b) => a.start - b.start);
}

// Unused helper function retained for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _buildWordTiming(_text: string, _segments: SrtSegment[]) {
  const tokens = text.split(/(\s+)/);
  const totalChars = Math.max(1, text.length);
  let cursor = 0;
  const out: { word: string; start: number; end: number; i: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const startIdx = cursor;
    const endIdx = cursor + tok.length;
    cursor = endIdx;
    if (/^\s+$/.test(tok) || tok.length === 0) continue;
    const mid = (startIdx + endIdx) / 2 / totalChars;
    const segIdx = Math.min(segments.length - 1, Math.max(0, Math.floor(mid * segments.length)));
    const seg = segments[segIdx];
    const segDur = Math.max(0.001, seg.end - seg.start);
    const segStartFrac = segIdx / Math.max(1, segments.length);
    const segEndFrac = (segIdx + 1) / Math.max(1, segments.length);
    const localFrac = (mid - segStartFrac) / Math.max(0.001, segEndFrac - segStartFrac);
    const approxStart = seg.start + Math.max(0, Math.min(1, localFrac)) * segDur;
    const approxEnd = Math.min(seg.end, approxStart + Math.min(0.7, segDur * 0.25));
    out.push({ word: tok, start: approxStart, end: approxEnd, i });
  }
  return out;
}

function SanitiseTab({ selectedFile, onStartSanitisation }: Props) {
  const [text, setText] = useState<string>('');
  // Single-editor design: textarea for editing + overlay for highlights
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timeline, setTimeline] = useState<TimelineToken[] | null>(null);
  const [, setWordTimings] = useState<WordTimings | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  // Processed WAV audio player (processed.wav)
  const processedAudioRef = useRef<HTMLAudioElement | null>(null);
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  // Toggle for click-to-seek feature
  const [clickToSeekEnabled, setClickToSeekEnabled] = useState<boolean>(true);

  // Auto-save helper function
  const autoSave = async (textToSave: string, fileId: string) => {
    try {
      setError(null);
      await fetchWithTimeout(
        `${API_BASE_URL}/api/files/${encodeURIComponent(fileId)}/sanitised`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sanitised: textToSave }),
          timeoutMs: 12000,
        }
      );
      setSaveError(false);
    } catch (e: any) {
      console.error('Auto-save failed:', e);
      setSaveError(true);
    }
  };

  // Track previous file to save before switching
  const prevFileRef = useRef<string | null>(null);
  const prevTextRef = useRef<string>('');

  // Auto-save text changes with debouncing
  useEffect(() => {
    if (!selectedFile || !text) return;
    
    const timer = setTimeout(() => {
      autoSave(text, selectedFile.id);
    }, 1500); // 1.5 second debounce
    
    return () => clearTimeout(timer);
  }, [text, selectedFile?.id]);

  // Save immediately when switching files (to catch unsaved changes)
  useEffect(() => {
    // If file changed and we had previous data, save it immediately
    if (prevFileRef.current && prevFileRef.current !== selectedFile?.id && prevTextRef.current) {
      autoSave(prevTextRef.current, prevFileRef.current);
    }
    
    // Update refs for next change
    prevFileRef.current = selectedFile?.id || null;
    prevTextRef.current = text;
  }, [selectedFile?.id]);

  // Load text + audio + timeline whenever file changes
  useEffect(() => {
    if (!selectedFile) return;

    // Always fetch fresh sanitised content from backend; fallback to transcript or in-file value
    (async () => {
      try {
        setError(null);
        const resp = await fetchWithTimeout(
          `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/content/sanitised`,
          { timeoutMs: 8000 }
        );
        if (resp.ok) {
          const j = await resp.json();
          setText(String(j?.content ?? ''));
        } else {
          const r2 = await fetchWithTimeout(
            `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/content/transcript`,
            { timeoutMs: 8000 }
          ).catch(() => null as any);
          if (r2 && r2.ok) {
            const j2 = await r2.json();
            setText(String(j2?.content ?? ''));
          } else {
            setText(selectedFile.sanitised || selectedFile.output || '');
          }
        }
      } catch (_) {
        setText(selectedFile.sanitised || selectedFile.output || '');
      }
    })();

    const cacheBust = Date.now();
    const processedUrl = `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/audio/processed?v=${cacheBust}`;
    setProcessedAudioUrl(processedUrl);
    (async () => {
      try {
        setError(null);
        setLoadingTimeline(true);
        // Try word timings JSON first
        const wtr = await fetchWithTimeout(
          `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/word_timings`,
          { timeoutMs: 10000 }
        );
        if (wtr.ok) {
          const wt: WordTimings = await wtr.json();
          setWordTimings(wt);
          // Flatten into timeline tokens for alignment fallback
          const toks: TimelineToken[] = (wt.segments || []).flatMap(seg => seg.words.map(w => ({ text: w.word, start: w.start, end: w.end })));
          setTimeline(toks);
        } else {
          // Fallback to SRT token timeline
          const resp = await fetchWithTimeout(
            `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/srt`,
            { timeoutMs: 10000 }
          );
          if (!resp.ok) throw new Error(`SRT HTTP ${resp.status}`);
          const srt = await resp.text();
          const segs = parseSRT(srt);
          const toks: TimelineToken[] = segs.map(seg => ({ text: seg.text, start: seg.start, end: seg.end }));
          setTimeline(toks);
          setWordTimings(null);
        }
      } catch (e: any) {
        setTimeline(null);
        setWordTimings(null);
        setError(e?.message || 'Failed to load timings');
      } finally {
        setLoadingTimeline(false);
      }
    })();
  }, [selectedFile?.id, selectedFile?.steps?.sanitise]);
  // Keep text updated when sanitise completes or transcript changes
  useEffect(() => {
    if (!selectedFile) return;
    const latest = selectedFile.sanitised || selectedFile.output || '';
    setText(latest);
  }, [selectedFile?.sanitised, selectedFile?.output, selectedFile?.steps?.sanitise]);

  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  // Map each token to its character range in the textarea value for caret-based seeking
  const tokenCharRanges = useMemo(() => {
    const ranges: { i: number; start: number; end: number; isSpace: boolean }[] = [];
    let pos = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const start = pos;
      const end = pos + tok.length;
      ranges.push({ i, start, end, isSpace: /^\s+$/.test(tok) });
      pos = end;
    }
    return ranges;
  }, [tokens.join('')]);

  // Normalize token to align (strip brackets, lowercase, trim punctuation)
  function normToken(s: string): string {
    const unbracket = s.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
    return unbracket.replace(/[\p{P}\p{S}]/gu, '').toLowerCase().trim();
  }

  // Build word timing via a simple greedy alignment first (robust and fast)
  const wordTiming = useMemo(() => {
    if (!text || !timeline || timeline.length === 0) return null;

    // Build source tokens from SRT timeline; drop pure punctuation cues
    const punctOnly = /^\p{P}+$/u;
    const src = timeline
      .map(t => ({ raw: String(t.text||''), norm: normToken(String(t.text||'')), start: t.start, end: t.end }))
      .filter(t => t.norm.length > 0 && !punctOnly.test(t.raw.trim()));

    // Build target tokens (sanitised text)
    const tgt: { i: number; raw: string; norm: string }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (/^\s+$/.test(tok) || tok.length === 0) continue;
      tgt.push({ i, raw: tok, norm: normToken(tok) });
    }

    // Windowed greedy: search ahead within a small window for a match; do not consume src on a miss.
    const WINDOW = 24;
    const JOIN_MAX = 4; // try joining up to 4 src tokens
    let iSrc = 0;
    const entries: { word: string; start: number; end: number; i: number }[] = [];
    for (let iTgt = 0; iTgt < tgt.length; iTgt++) {
      const targ = tgt[iTgt];
      if (targ.norm.length === 0) { entries.push({ word: targ.raw, start: NaN, end: NaN, i: targ.i }); continue; }

      // Search single-token match within window
      let foundAt = -1;
      for (let k = iSrc; k < Math.min(src.length, iSrc + WINDOW); k++) {
        if (src[k].norm === targ.norm) { foundAt = k; break; }
      }

      if (foundAt >= 0) {
        entries.push({ word: targ.raw, start: src[foundAt].start, end: Math.max(src[foundAt].start, src[foundAt].end), i: targ.i });
        iSrc = foundAt + 1; // advance past the matched word
        continue;
      }

      // Try joined matches (e.g., Th+ier+ry -> Thierry, I+'m->I'm, T-+Rox -> T-Rox)
      let joinedMatch = false;
      outer: for (let start = iSrc; start < Math.min(src.length, iSrc + WINDOW); start++) {
        let normJoin = "";
        let jEnd = start;
        let jCount = 0;
        let sStart = Number.POSITIVE_INFINITY;
        let sEnd = 0;
        while (jEnd < src.length && jCount < JOIN_MAX) {
          normJoin += src[jEnd].norm;
          sStart = Math.min(sStart, src[jEnd].start);
          sEnd = Math.max(sEnd, src[jEnd].end);
          jCount++;
          if (normJoin === targ.norm) {
            entries.push({ word: targ.raw, start: sStart, end: Math.max(sStart, sEnd), i: targ.i });
            iSrc = jEnd + 1;
            joinedMatch = true;
            break outer;
          }
          jEnd++;
        }
      }
      if (joinedMatch) continue;

      // No match → mark untimed; do NOT advance iSrc so we can recover later
      entries.push({ word: targ.raw, start: NaN, end: NaN, i: targ.i });
    }

    return entries;
  }, [text, tokens, JSON.stringify(timeline)]);

  // Track metadata and drive highlighting via rAF loop
  useEffect(() => {
    const el = processedAudioRef.current;
    if (!el) return;
    const onMeta = () => {
      if (!Number.isNaN(el.duration) && el.duration > 0) setAudioDuration(el.duration);
    };
    el.addEventListener('loadedmetadata', onMeta);
    onMeta();
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, [processedAudioUrl, selectedFile?.id]);

  // Build a sorted list of timed entries for rAF binary search
  const timedEntries = useMemo(() => {
    if (!wordTiming) return [] as { i: number; start: number; end: number }[];
    return wordTiming.filter(w => Number.isFinite(w.start)).map(w => ({ i: w.i, start: w.start, end: w.end }))
      .sort((a, b) => a.start - b.start);
  }, [JSON.stringify(wordTiming || [])]);

  useEffect(() => {
    const el = processedAudioRef.current;
    if (!el || timedEntries.length === 0) return;

    const HYS = 0.03; // 30ms hysteresis
    const findActiveIndex = (t: number): number | null => {
      // Binary search by start time
      let lo = 0, hi = timedEntries.length - 1, pos = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (timedEntries[mid].start <= t) { pos = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (pos < 0) return null;
      // Walk forward if current time is within end
      for (let k = Math.max(0, pos - 2); k < Math.min(timedEntries.length, pos + 3); k++) {
        const e = timedEntries[k];
        if (t >= e.start - HYS && t <= e.end + HYS) return e.i;
      }
      // Fallback: nearest start
      return timedEntries[pos].i;
    };

    let running = false;
    const loop = () => {
      if (!running) return;
      const t = el.currentTime || 0;
      const cur = findActiveIndex(t);
      if (cur !== activeIndexRef.current) {
        activeIndexRef.current = cur;
        setActiveIndex(cur);
      }
      rafIdRef.current = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      rafIdRef.current = window.requestAnimationFrame(loop);
    };

    const stop = () => {
      running = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };

    // Start immediately
    start();

    // When user scrubs or restarts playback, ensure loop resumes
    const clearOnSeeking = () => { activeIndexRef.current = null; setActiveIndex(null); };
    el.addEventListener('play', start);
    el.addEventListener('seeked', start);
    el.addEventListener('ratechange', start);
    el.addEventListener('seeking', clearOnSeeking);
    el.addEventListener('pause', stop);
    el.addEventListener('ended', stop);

    return () => {
      stop();
      el.removeEventListener('play', start);
      el.removeEventListener('seeked', start);
      el.removeEventListener('ratechange', start);
      el.removeEventListener('seeking', clearOnSeeking);
      el.removeEventListener('pause', stop);
      el.removeEventListener('ended', stop);
    };
  }, [processedAudioUrl, selectedFile?.id, JSON.stringify(timedEntries)]);

  const handleClickWord = (startSec: number | null) => {
    const el = processedAudioRef.current;
    if (!el || startSec == null || Number.isNaN(startSec)) return;
    const CLICK_OFFSET_SECONDS = 2; // jump back 2s before the word
    const t = Math.max(0, startSec - CLICK_OFFSET_SECONDS);
    el.currentTime = t;
    void el.play().catch(() => {});
  };


  // Manual save kept as a helper (not shown in UI)
  const handleSave = async () => {
    if (!selectedFile) return;
    try {
      setError(null);
      // Save to 'sanitised' so the original transcript in status.json remains intact
      const resp = await fetchWithTimeout(
        `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/sanitised`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sanitised: text }),
          timeoutMs: 12000,
        }
      );
      if (!resp.ok) {
        const tx = await resp.text().catch(() => '');
        throw new Error(`Save failed: HTTP ${resp.status} ${tx}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    }
  };

  const handleRestore = async () => {
    if (!selectedFile) return;
    try {
      setError(null);
      // Fetch the original transcript from backend to avoid stale/missing client-side fields
      const resp = await fetchWithTimeout(
        `${API_BASE_URL}/api/files/${encodeURIComponent(selectedFile.id)}/content/transcript`,
        { timeoutMs: 10000 }
      );
      if (!resp.ok) {
        const tx = await resp.text().catch(() => '');
        throw new Error(`Restore failed: HTTP ${resp.status} ${tx}`);
      }
      const json = await resp.json();
      const original = String(json?.content ?? '');
      setText(original);
    } catch (e: any) {
      setError(e?.message || 'Failed to restore original transcript');
    }
  };

  if (!selectedFile) {
    return <div className="text-text-secondary">Select a file to sanitise and review.</div>;
  }

  const isSanitising = selectedFile.steps.sanitise === 'processing';

  return (
    <div className="space-y-6">
      <section className="p-4 border border-border-primary rounded-lg bg-background-tertiary">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Step 1 — Sanitise</h3>
        <p className="text-sm text-text-secondary mb-3">Run the sanitisation pass.</p>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-2 rounded-md bg-btn-primary text-white hover:opacity-90 disabled:opacity-50"
            disabled={isSanitising}
            onClick={() => {
              console.log('Sanitise button clicked, fileId:', selectedFile.id);
              console.log('onStartSanitisation function:', onStartSanitisation);
              onStartSanitisation(selectedFile.id);
            }}
          >
            {isSanitising ? 'Sanitising…' : 'Sanitise'}
          </button>
          <span className="text-sm text-text-tertiary">Status: {selectedFile.steps.sanitise}</span>
        </div>
      </section>

      <section className="p-4 border border-border-primary rounded-lg bg-background-primary">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Step 2 — Review & Correct</h3>
        <p className="text-sm text-text-secondary mb-4">
          Click words to jump audio. Edit directly in the box below; highlights and seeking work while you type.
        </p>
        <div className="space-y-4">
          {/* Processed WAV audio player */}
          <div>
            <div className="text-sm text-text-tertiary mb-1">Processed audio (WAV)</div>
            <div className="flex items-stretch gap-2">
              <audio
                ref={processedAudioRef}
                src={processedAudioUrl ?? undefined}
                controls
                className="flex-1"
                crossOrigin="anonymous"
              />
              <button
                onClick={() => setClickToSeekEnabled(!clickToSeekEnabled)}
                className={`w-12 aspect-square flex items-center justify-center rounded border-2 transition-colors ${
                  clickToSeekEnabled
                    ? 'bg-status-processing-bg border-status-processing-border text-status-processing-text hover:bg-status-processing-bg/80'
                    : 'bg-surface-elevated border-theme-border text-muted hover:bg-surface-elevated/80'
                }`}
                title={clickToSeekEnabled ? 'Click-to-seek: ON (click to disable)' : 'Click-to-seek: OFF (click to enable)'}
              >
                <span className="text-xl">{clickToSeekEnabled ? '🔊' : '🔇'}</span>
              </button>
            </div>
          </div>

          {audioDuration != null && (
            <div className="text-xs text-text-tertiary">Duration: {Math.round(audioDuration)}s</div>
          )}
          {loadingTimeline && <div className="text-sm text-text-tertiary">Loading timeline…</div>}
          {!loadingTimeline && !text && <div className="text-sm text-text-tertiary">No transcript available.</div>}

          {/* Single editor: textarea for input + overlay for highlights */}
          <div className="relative border border-border-secondary rounded-md bg-background-secondary h-96">
            {/* Overlay: shows highlighted, clickable words; scroll-synced; pointer-events enabled on spans only */}
            <div
              ref={overlayRef}
              className="absolute inset-0 overflow-hidden px-3 py-3 leading-7 whitespace-pre-wrap text-text-primary select-text"
              style={{ pointerEvents: 'none' }}
            >
              {(() => {
                if (!text) return null;
                const byIndex = new Map<number, { start: number; end: number }>();
                if (wordTiming) {
                  for (const w of wordTiming) byIndex.set(w.i, { start: w.start, end: w.end });
                }
                const nameRegex = /(\[\[[^\]]+\]\])/g;
                return (
                  <div>
                    {tokens.map((tok, i) => {
                      const timing = byIndex.get(i);
                      const parts = tok.split(nameRegex);
                      const renderName = (m: string, key: string | number) => (
                        <span key={key} className="text-processing-700 font-medium" style={{ pointerEvents: 'auto' }}>{m}</span>
                      );
                      if (!timing) {
                        return (
                          <span key={i} style={{ pointerEvents: 'auto' }}>
                            {parts.map((p, idx) => (nameRegex.test(p) ? renderName(p, `${i}-${idx}`) : p))}
                          </span>
                        );
                      }
                      const isActive = activeIndex != null && i === activeIndex;
                      return (
                        <span
                          key={i}
                          className={
                            'hover:bg-processing-100 hover:text-processing-700 ' +
                            (isActive ? 'bg-processing-100 text-processing-700 rounded' : '')
                          }
                          title={isFinite(timing.start) ? `${timing.start.toFixed(2)}s` : ''}
                        >
                          {parts.map((p, idx) => (nameRegex.test(p) ? renderName(p, `${i}-${idx}`) : p))}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* Textarea for editing: transparent text color so overlay text is visible; caret remains visible */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); }}
              onScroll={(e) => {
                const t = e.target as HTMLTextAreaElement;
                if (overlayRef.current) {
                  overlayRef.current.scrollTop = t.scrollTop;
                  overlayRef.current.scrollLeft = t.scrollLeft;
                }
              }}
              onMouseUp={() => {
                // Seek to the word at the caret position (only if click-to-seek is enabled)
                if (!clickToSeekEnabled) return;
                const t = textareaRef.current;
                if (!t) return;
                const caret = t.selectionStart ?? 0;
                // Find token whose range contains the caret; if whitespace, pick nearest non-space to the left, else right
                let idx = tokenCharRanges.findIndex(r => caret >= r.start && caret < r.end);
                if (idx === -1 && caret === (text?.length || 0) && tokenCharRanges.length > 0) idx = tokenCharRanges.length - 1;
                let target = idx >= 0 ? tokenCharRanges[idx] : null;
                if (target && target.isSpace) {
                  // prefer left non-space
                  let j = idx - 1;
                  while (j >= 0 && tokenCharRanges[j].isSpace) j--;
                  if (j >= 0) target = tokenCharRanges[j];
                  else {
                    j = idx + 1;
                    while (j < tokenCharRanges.length && tokenCharRanges[j].isSpace) j++;
                    if (j < tokenCharRanges.length) target = tokenCharRanges[j];
                  }
                }
                if (target) {
                  // Look up timing for this token index
                  const byIndex = new Map<number, { start: number; end: number }>();
                  if (wordTiming) {
                    for (const w of wordTiming) byIndex.set(w.i, { start: w.start, end: w.end });
                  }
                  const timing = byIndex.get(target.i);
                  if (timing && Number.isFinite(timing.start)) {
                    handleClickWord(timing.start);
                  }
                }
              }}
              className="absolute inset-0 w-full h-full resize-none bg-transparent px-3 py-3 leading-7 whitespace-pre-wrap font-sans overflow-auto"
              style={{ color: 'transparent', caretColor: 'var(--text-primary, #111111)' }}
              spellCheck={true}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="px-3 py-2 rounded-md bg-background-secondary text-text-primary border border-border-secondary hover:bg-background-tertiary"
              onClick={() => { handleRestore(); }}
              title="Replace with original transcribed text"
            >
              Restore transcribed text
            </button>
            {saveError
              ? <span className="text-xs text-error-600">Save failed — check backend</span>
              : <span className="text-xs text-text-tertiary">Changes auto-save after 1.5s</span>
            }
            {error && <span className="text-sm text-error-600">{error}</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

export default SanitiseTab;
