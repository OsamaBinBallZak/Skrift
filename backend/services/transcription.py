"""
Transcription service
Handles solo and conversation transcription business logic
"""  # NOTE: dynamic timeout and streaming support added

import subprocess
import shutil
import time
import threading
from pathlib import Path
from models import ProcessingStatus
from utils.status_tracker import status_tracker

# Track active solo transcription subprocesses so we can cancel them
_ACTIVE_TRANSCRIBE_PROCS: dict[str, subprocess.Popen] = {}
_ACTIVE_TRANSCRIBE_LOCK = threading.Lock()

def cancel_transcription_process(file_id: str) -> bool:
    """Attempt to cancel an in-flight solo transcription for a given file.

    Returns True if a running process was found and a kill signal was sent,
    False if no active process is tracked.
    """
    if not file_id:
        return False
    proc = None
    with _ACTIVE_TRANSCRIBE_LOCK:
        proc = _ACTIVE_TRANSCRIBE_PROCS.get(file_id)
    if not proc:
        return False
    try:
        proc.kill()
        return True
    except Exception:
        return False
from config.settings import (
    get_whisper_path_dynamic,
    get_dependency_paths,
)


def _compute_dynamic_timeout_seconds(file_id: str | None) -> int:
    """Compute a sensible timeout for solo transcription.

    Uses audio duration (seconds) from audioMetadata.duration_seconds when available,
    with a minimum of 10 minutes. This keeps long files from timing out prematurely
    while still protecting against hung processes.
    """
    base_timeout = 600  # 10 minutes
    if not file_id:
        return base_timeout

    try:
        pipeline_file = status_tracker.get_file(file_id)
        if not pipeline_file or not pipeline_file.audioMetadata:
            return base_timeout
        dur = float(pipeline_file.audioMetadata.get("duration_seconds") or 0)
    except Exception:
        return base_timeout

    if dur <= 0:
        return base_timeout

    # Use at least the audio duration, but never less than 10 minutes
    return int(max(dur, base_timeout))


def run_solo_transcription(audio_file_path: str, output_dir: Path, file_id: str = None) -> str:
    """Run solo transcription using whisper.cpp with progress tracking"""
    import logging
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    logger.info(f"=== TRANSCRIPTION START ====")
    logger.info(f"File ID: {file_id}")
    logger.info(f"Audio file path: {audio_file_path}")
    logger.info(f"Output directory: {output_dir}")
    
    # Resolve solo transcription path from dependencies_folder
    dep_paths = get_dependency_paths()
    solo_path = dep_paths['whisper'] / "Metal-Version-float32-coreml"
    logger.info(f"Solo transcription path: {solo_path}")
    
    # Verify paths exist
    if not Path(audio_file_path).exists():
        error_msg = f"Audio file does not exist: {audio_file_path}"
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    if not solo_path.exists():
        error_msg = f"Transcription module path does not exist: {solo_path}"
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    # Create unique input filename to avoid conflicts
    input_filename = f"input_{file_id}.m4a" if file_id else "input.m4a"
    input_file = output_dir / input_filename # Save input in output folder
    
    logger.info(f"Copying {audio_file_path} -> {input_file}")
    try:
        shutil.copy2(audio_file_path, input_file)
        logger.info(f"File copy successful. Size: {input_file.stat().st_size} bytes")
    except Exception as e:
        logger.error(f"File copy failed: {e}")
        raise
    
    print(f"Starting solo transcription for {audio_file_path}")
    print(f"Output will be stored in: {output_dir}")
    
    # Update status to preprocessing
    if file_id:
        logger.info(f"Updating status: preprocessing")
        status_tracker.update_last_activity(file_id, "Preparing to transcribe...")
    
    # Run transcription - simplified to avoid subprocess deadlocks
    cmd = ["./transcribe.sh", str(input_file), str(output_dir)]
    logger.info(f"Command to execute: {' '.join(cmd)}")
    logger.info(f"Working directory: {solo_path}")
    
    # Verify transcribe.sh exists
    transcribe_script = solo_path / "transcribe.sh"
    if not transcribe_script.exists():
        error_msg = f"Transcription script not found: {transcribe_script}"
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    logger.info(f"Transcription script found: {transcribe_script}")
    
    # Update status before starting
    if file_id:
        logger.info(f"Updating status: starting transcription")
        status_tracker.update_last_activity(file_id, "Loading transcription model...")
    
    # Use subprocess.Popen so we can track and cancel the process if needed
    timeout_seconds = _compute_dynamic_timeout_seconds(file_id)
    logger.info(f"Executing subprocess with timeout={timeout_seconds}s")
    start_time = time.time()

    proc: subprocess.Popen | None = None
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=solo_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if file_id:
            with _ACTIVE_TRANSCRIBE_LOCK:
                _ACTIVE_TRANSCRIBE_PROCS[file_id] = proc

        try:
            stdout, stderr = proc.communicate(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            logger.error(f"Subprocess timed out after {timeout_seconds}s; killing process")
            try:
                proc.kill()
                stdout, stderr = proc.communicate()
            except Exception:
                stdout, stderr = "", ""
            minutes = max(1, int(timeout_seconds // 60))
            raise RuntimeError(f"Transcription timed out after {minutes} minutes")

        execution_time = time.time() - start_time
        logger.info(f"Subprocess completed in {execution_time:.2f}s")
    except Exception as e:
        logger.error(f"Subprocess execution failed: {e}")
        raise
    finally:
        if file_id:
            with _ACTIVE_TRANSCRIBE_LOCK:
                _ACTIVE_TRANSCRIBE_PROCS.pop(file_id, None)

    return_code = proc.returncode if proc is not None else -1
    logger.info(f"Subprocess return code: {return_code}")
    logger.info(f"Subprocess stdout length: {len(stdout or '')} chars")
    logger.info(f"Subprocess stderr length: {len(stderr or '')} chars")
    
    if stdout:
        logger.debug(f"Subprocess stdout: {stdout[:500]}...")  # First 500 chars
    if stderr:
        logger.warning(f"Subprocess stderr: {stderr[:500]}...")  # First 500 chars
    
    # Update status after transcription
    if file_id:
        logger.info(f"Updating status: processing output")
        status_tracker.update_last_activity(file_id, "Processing transcription output...")
    
    if return_code != 0:
        error_output = stderr or stdout or "No output captured"
        logger.error(f"Transcription failed with exit code {return_code}")
        logger.error(f"Error output: {error_output}")
        raise RuntimeError(f"Solo transcription failed (exit code {return_code}): {error_output}")
    
    # Find and read output file
    output_basename = input_filename.replace(".m4a", "")
    output_filename = f"{output_basename}.txt"
    output_file = output_dir / output_filename

    if not output_file.exists():
        available_files = list(output_dir.glob("*.txt"))
        raise RuntimeError(f"Transcription output file not found. Available files: {available_files}")

    with open(output_file, 'r', encoding='utf-8') as f:
        content = f.read().strip()

    # If a JSON (full) or word-timestamps file was generated, keep it and store a reference
    json_file = output_dir / f"{output_basename}.json"
    if json_file.exists():
        try:
            status_tracker.add_audio_metadata(file_id, {"json_path": str(json_file)})
        except Exception:
            pass
    wts_file = output_dir / f"{output_basename}.wts"
    if wts_file.exists():
        try:
            status_tracker.add_audio_metadata(file_id, {"wts_path": str(wts_file)})
        except Exception:
            pass

    # Normalize processed audio file name to processed.wav (store path in metadata)
    try:
        processed_fixed = output_dir / "processed.wav"
        if processed_fixed.exists():
            status_tracker.add_audio_metadata(file_id, {"processed_wav_path": str(processed_fixed)})
        else:
            cand_list = list(output_dir.glob(f"{output_basename}_processed.wav")) or list(output_dir.glob("*_processed.wav"))
            if cand_list:
                cand = cand_list[0]
                # Rename to processed.wav for stable path
                try:
                    cand.rename(processed_fixed)
                    status_tracker.add_audio_metadata(file_id, {"processed_wav_path": str(processed_fixed)})
                except Exception:
                    # If rename fails, keep original and record its path
                    status_tracker.add_audio_metadata(file_id, {"processed_wav_path": str(cand)})
    except Exception:
        pass

    # Persist json_path if present and synthesize word-level SRT alongside outputs
    try:
        json_path = output_dir / f"{output_basename}.json"
        if json_path.exists():
            status_tracker.add_audio_metadata(file_id, {"json_path": str(json_path)})
            # Build a detailed word-level SRT file timeline_word.srt from JSON
            import json as _json
            def _fmt_tc(sec: float) -> str:
                if sec < 0: sec = 0
                ms = int(round((sec - int(sec)) * 1000.0))
                s = int(sec) % 60
                m = (int(sec) // 60) % 60
                h = int(sec) // 3600
                return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
            def _parse_tc(tc: str) -> float:
                tc = str(tc)
                hms, ms = tc.split(',') if ',' in tc else (tc, '0')
                h, m, s = [float(x) for x in hms.split(':')]
                return h*3600 + m*60 + s + float(ms)/1000.0
            data = _json.loads(json_path.read_text(encoding='utf-8', errors='ignore'))
            # Collect tokens from either structure
            toks = []
            # A) segments tokens/words
            for seg in (data.get('segments') or []):
                for tok in (seg.get('tokens') or seg.get('words') or []):
                    txt = tok.get('text') or tok.get('word') or ''
                    start = tok.get('start'); end = tok.get('end')
                    if start is None and 't0' in tok and 't1' in tok:
                        start = float(tok['t0']) * 0.01; end = float(tok['t1']) * 0.01
                    if start is None and isinstance(tok.get('timestamps'), dict):
                        start = _parse_tc(tok['timestamps'].get('from','00:00:00,000'))
                        end = _parse_tc(tok['timestamps'].get('to','00:00:00,000'))
                    if start is not None:
                        toks.append({'text': txt, 'start': float(start), 'end': float(max(start, end if end is not None else start))})
            # B) top-level transcription[].tokens
            if not toks and isinstance(data.get('transcription'), list):
                for item in data['transcription']:
                    for tok in (item.get('tokens') or []):
                        txt = tok.get('text') or tok.get('word') or ''
                        off = tok.get('offsets')
                        if isinstance(off, dict) and ('from' in off or 'to' in off):
                            s = float(off.get('from',0))/1000.0; e = float(off.get('to', off.get('from',0)))/1000.0
                        else:
                            tsd = tok.get('timestamps') or {}
                            s = _parse_tc(tsd.get('from','00:00:00,000'))
                            e = _parse_tc(tsd.get('to','00:00:00,000'))
                        toks.append({'text': txt, 'start': s, 'end': max(s,e)})
            if toks:
                # No longer synthesize token-level SRT; rely on CLI -osrt output for human export
                pass

            # Record CLI-generated SRT path if present (for human export/viewing)
            try:
                srts = list(output_dir.glob(f"{output_basename}.srt")) or list(output_dir.glob("*.srt"))
                if srts:
                    status_tracker.add_audio_metadata(file_id, {"srt_path": str(srts[0])})
            except Exception:
                pass

            # Build compact word_timings.json from JSON-full using offsets.from/to (ms)
            import re as _re
            def _norm_word(s: str) -> str:
                return s.strip()
            def _is_control(s: str) -> bool:
                return s.startswith('[_') and s.endswith('_]')
            def _strip_controls_inline(s: str) -> str:
                # Remove any inline control markers like [_TT_123], [_BEG_], etc.
                return _re.sub(r"\[_[^\]]+\]", "", s)
            def _is_punct_only(s: str) -> bool:
                st = s.strip()
                return st != '' and all(not ch.isalnum() for ch in st)

            segments = []
            audio_dur = 0.0
            dtw_model = None

            # Detect DTW presence anywhere in JSON (segments or transcription tokens)
            try:
                found_dtw = False
                for seg in (data.get('segments') or []):
                    for tok in (seg.get('tokens') or seg.get('words') or []):
                        if tok.get('t_dtw') is not None:
                            found_dtw = True; break
                    if found_dtw: break
                if not found_dtw and isinstance(data.get('transcription'), list):
                    for item in data['transcription']:
                        for tok in (item.get('tokens') or []):
                            if tok.get('t_dtw') is not None:
                                found_dtw = True; break
                        if found_dtw: break
                dtw_model = 'large.v3' if found_dtw else None
            except Exception:
                dtw_model = None

            # Prefer standard whisper.cpp structure for segments
            segs = data.get('segments') or []
            if segs:
                for si, seg in enumerate(segs):
                    words = []
                    tok_list = seg.get('tokens') or seg.get('words') or []
                    cur = {'text': '', 'start_ms': None, 'end_ms': None}
                    def flush():
                        nonlocal words, cur, audio_dur
                        if cur['text']:
                            s = max(0.0, (cur['start_ms'] or 0)/1000.0)
                            e = max(s, (cur['end_ms'] or cur['start_ms'] or 0)/1000.0)
                            audio_dur = max(audio_dur, e)
                            words.append({
                                'token_id': len(words),
                                'word': cur['text'],
                                'start': s,
                                'end': e,
                            })
                            cur = {'text': '', 'start_ms': None, 'end_ms': None}
                    for tok in tok_list:
                        txt_raw = str(tok.get('text') or tok.get('word') or '')
                        txt = _strip_controls_inline(txt_raw)
                        # Determine ms timings
                        off = tok.get('offsets') or {}
                        s_ms = off.get('from'); e_ms = off.get('to') if off else None
                        # Fallbacks
                        if s_ms is None and ('t0' in tok or 't1' in tok):
                            s_ms = int(float(tok.get('t0', 0)) * 10.0)
                            e_ms = int(float(tok.get('t1', tok.get('t0', 0))) * 10.0)
                        if s_ms is None and ('start' in tok or 'end' in tok):
                            s_val = float(tok.get('start', 0)); e_val = float(tok.get('end', s_val))
                            # assume seconds
                            s_ms = int(s_val * 1000); e_ms = int(e_val * 1000)
                        if s_ms is None:
                            # no timing → treat as boundary and flush
                            flush();
                            continue
                        # Skip control tokens entirely
                        if _is_control(txt.strip()):
                            flush();
                            continue
                        starts_new = txt.startswith(' ') or txt.startswith('\t') or txt.startswith('\n') or _is_punct_only(txt)
                        stripped = txt.strip()
                        if starts_new:
                            flush()
                        if not stripped or _is_punct_only(stripped):
                            # punctuation-only token → act as boundary
                            flush()
                            continue
                        if not cur['text']:
                            cur['text'] = _norm_word(stripped)
                            cur['start_ms'] = int(s_ms)
                            cur['end_ms'] = int(e_ms if e_ms is not None else s_ms)
                        else:
                            cur['text'] += _norm_word(stripped)
                            cur['end_ms'] = max(int(cur['end_ms'] or 0), int(e_ms if e_ms is not None else s_ms))
                    flush()
                    if words:
                        s_seg = words[0]['start']; e_seg = words[-1]['end']
                        audio_dur = max(audio_dur, e_seg)
                        segments.append({ 'idx': si, 'start': s_seg, 'end': e_seg, 'words': words })
            else:
                # Fallback: build a single segment from the flat tokens list above
                words = []
                cur = {'text': '', 'start': None, 'end': None}
                def flush2():
                    nonlocal words, cur, audio_dur
                    if cur['text']:
                        s = max(0.0, float(cur['start'] or 0))
                        e = max(s, float(cur['end'] or cur['start'] or 0))
                        audio_dur = max(audio_dur, e)
                        words.append({ 'token_id': len(words), 'word': cur['text'], 'start': s, 'end': e })
                        cur = {'text': '', 'start': None, 'end': None}
                for t in toks:
                    txt_raw = str(t['text'] or '')
                    txt = _strip_controls_inline(txt_raw)
                    if _is_control(txt.strip()):
                        flush2();
                        continue
                    starts_new = txt.startswith(' ') or txt.startswith('\t') or txt.startswith('\n') or _is_punct_only(txt)
                    stripped = txt.strip()
                    if starts_new:
                        flush2()
                    if not stripped or _is_punct_only(stripped):
                        flush2();
                        continue
                    if not cur['text']:
                        cur['text'] = _norm_word(stripped); cur['start'] = t['start']; cur['end'] = t['end']
                    else:
                        cur['text'] += _norm_word(stripped); cur['end'] = max(cur['end'], t['end'])
                flush2()
                if words:
                    segments.append({ 'idx': 0, 'start': words[0]['start'], 'end': words[-1]['end'], 'words': words })

            wt = {
                'version': '1',
                'audio': { 'processed_wav': 'processed.wav', 'duration_sec': audio_dur },
                'dtw_model': dtw_model,
                'segments': segments,
            }
            try:
                import json as _json2
                (output_dir / 'word_timings.json').write_text(_json2.dumps(wt, ensure_ascii=False, indent=2), encoding='utf-8')
                status_tracker.add_audio_metadata(file_id, {"word_timings_path": str(output_dir / 'word_timings.json')})
            except Exception:
                pass

    except Exception:
        pass

    print(f"Transcription completed successfully. Output length: {len(content)} characters")

    # Clean up temporary input and text artifact (keep .wts if present)
    if input_file.exists():
        input_file.unlink()
    if output_file.exists():
        output_file.unlink()

    return content


def process_transcription_thread(file_id: str, conversation_mode: bool):
    """Thread function to handle transcription processing without blocking FastAPI"""
    start_time = time.time()
    
    # Thread for periodic activity updates
    stop_heartbeat = threading.Event()
    
    def heartbeat_thread():
        """Update activity every 10 seconds while transcribing"""
        while not stop_heartbeat.is_set():
            pipeline_file = status_tracker.get_file(file_id)
            if pipeline_file and pipeline_file.steps.transcribe == ProcessingStatus.PROCESSING:
                elapsed = int(time.time() - start_time)
                if elapsed < 60:
                    time_str = f"{elapsed}s"
                else:
                    minutes = elapsed // 60
                    seconds = elapsed % 60
                    time_str = f"{minutes}m {seconds}s"
                    
                status_tracker.update_last_activity(
                    file_id, 
                    f"Transcribing audio... ({time_str} elapsed)"
                )
            
            # Wait 10 seconds or until stopped
            stop_heartbeat.wait(10)
    
    # Start heartbeat thread
    heartbeat = threading.Thread(target=heartbeat_thread, daemon=True)
    heartbeat.start()
    
    try:
        pipeline_file = status_tracker.get_file(file_id)
        if not pipeline_file:
            return
        
        # Check if conversation mode is requested
        if conversation_mode:
            # Mark as not implemented for now
            status_tracker.update_file_status(
                file_id,
                "transcribe",
                ProcessingStatus.ERROR,
                error="Conversation transcription with speaker diarization is coming soon! Please use solo mode for now."
            )
            return
        
        audio_file_path = pipeline_file.path
        output_dir = Path(pipeline_file.path).parent

        # Run solo transcription with progress tracking
        transcript = run_solo_transcription(audio_file_path, output_dir, file_id)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        status_tracker.add_processing_time(file_id, "transcribe", processing_time)
        
        # Update status with result
        status_tracker.update_last_activity(file_id, "Transcription completed")
        status_tracker.update_file_status(
            file_id,
            "transcribe",
            ProcessingStatus.DONE,
            result_content=transcript
        )
        
    except Exception as e:
        # Update status with error
        status_tracker.update_file_status(
            file_id,
            "transcribe",
            ProcessingStatus.ERROR,
            error=str(e)
        )
        print(f"Transcription error for {file_id}: {e}")
    
    finally:
        # Stop heartbeat thread
        stop_heartbeat.set()
        heartbeat.join(timeout=1)


