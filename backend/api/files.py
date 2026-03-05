"""
File management API endpoints
Handles file upload, listing, and deletion operations
"""

import os
import shutil
from pathlib import Path
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Request
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse, StreamingResponse

from models import PipelineFile, UploadResponse
from utils.status_tracker import status_tracker
from config.settings import get_input_folder, get_output_folder, get_file_output_folder, settings

router = APIRouter()

@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    conversationMode: bool = Form(False)
):
    """
    Upload audio files to the processing pipeline
    Supports multiple files with conversation mode flag
    """
    
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    uploaded_files = []
    errors = []
    
    # Get supported formats
    supported_formats = settings.get("audio.supported_input_formats", [".m4a", ".wav", ".mp3"])
    
    for upload_file in files:
        try:
            # Validate file type
            file_ext = Path(upload_file.filename).suffix.lower()
            if file_ext not in supported_formats:
                errors.append(f"Unsupported file format: {upload_file.filename} ({file_ext})")
                continue
            
            # Create file output folder
            file_folder = get_file_output_folder(upload_file.filename)
            
            # Save original file
            original_path = file_folder / f"original{file_ext}"
            with open(original_path, "wb") as f:
                content = await upload_file.read()
                f.write(content)
            
            # Get file size
            file_size = len(content)
            
            # Create pipeline file entry
            pipeline_file = status_tracker.create_file(
                filename=upload_file.filename,
                path=str(original_path),
                size=file_size,
                conversation_mode=conversationMode
            )
            
            # Add basic audio metadata with duration
            audio_metadata = {
                "original_format": file_ext,
                "uploaded_size": file_size,
                "conversation_mode": conversationMode
            }
            
            # Extract audio duration using ffprobe
            try:
                import subprocess
                import json as json_module
                duration_cmd = [
                    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format",
                    str(original_path)
                ]
                result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    probe_data = json_module.loads(result.stdout)
                    duration_seconds = float(probe_data.get("format", {}).get("duration", 0))
                    if duration_seconds > 0:
                        # Format as HH:MM:SS
                        hours = int(duration_seconds // 3600)
                        minutes = int((duration_seconds % 3600) // 60)
                        seconds = int(duration_seconds % 60)
                        audio_metadata["duration"] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                        audio_metadata["duration_seconds"] = duration_seconds
            except Exception as e:
                print(f"Warning: Could not extract duration for {upload_file.filename}: {e}")
            
            status_tracker.add_audio_metadata(pipeline_file.id, audio_metadata)
            
            uploaded_files.append(pipeline_file)
            
        except Exception as e:
            errors.append(f"Failed to upload {upload_file.filename}: {str(e)}")
    
    if not uploaded_files and errors:
        raise HTTPException(status_code=400, detail=f"All uploads failed: {'; '.join(errors)}")
    
    return UploadResponse(
        success=True,
        files=uploaded_files,
        message=f"Successfully uploaded {len(uploaded_files)} file(s)",
        errors=errors if errors else None
    )

@router.get("/", response_model=List[PipelineFile])
async def get_files():
    """
    Get all pipeline files
    Returns array of PipelineFile objects
    """
    return status_tracker.get_all_files()

@router.get("/{file_id}", response_model=PipelineFile)
async def get_file(file_id: str):
    """
    Get a specific pipeline file by ID
    Returns single PipelineFile object with full details
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    return pipeline_file

@router.delete("/{file_id}")
async def delete_file(file_id: str):
    """
    Delete a pipeline file and all its associated data
    Returns success confirmation
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # Delete file folder and all contents
        file_folder = get_file_output_folder(pipeline_file.filename)
        if file_folder.exists():
            shutil.rmtree(file_folder)
        
        # Remove from status tracker
        status_tracker.delete_file(file_id)
        
        return {
            "success": True,
            "message": f"Successfully deleted {pipeline_file.filename}"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

@router.get("/{file_id}/status")
async def get_file_status(file_id: str):
    """
    Get current processing status for a file
    Returns PipelineFile object with current status
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    return pipeline_file

@router.post("/{file_id}/title/approve")
async def approve_title(file_id: str):
    """
    Mark AI-generated title as accepted by user
    Sets title_approval_status to 'accepted' in status.json
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if not pipeline_file.enhanced_title:
        raise HTTPException(status_code=400, detail="No AI-generated title available")
    
    # Update approval status
    pipeline_file.title_approval_status = "accepted"
    status_tracker.save_file_status(file_id)
    
    return {
        "success": True,
        "message": "Title approved",
        "title": pipeline_file.enhanced_title
    }

@router.post("/{file_id}/title/decline")
async def decline_title(file_id: str):
    """
    Mark AI-generated title as declined by user
    Sets title_approval_status to 'declined' in status.json
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if not pipeline_file.enhanced_title:
        raise HTTPException(status_code=400, detail="No AI-generated title available")
    
    # Update approval status
    pipeline_file.title_approval_status = "declined"
    status_tracker.save_file_status(file_id)
    
    return {
        "success": True,
        "message": "Title declined"
    }

@router.get("/{file_id}/content/{content_type}")
async def get_file_content(file_id: str, content_type: str):
    """
    Get file content (transcript, sanitised, enhanced, exported)
    Returns the requested content as plain text
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    content = None
    if content_type == "transcript":
        content = pipeline_file.transcript
    elif content_type == "sanitised":
        content = pipeline_file.sanitised
    elif content_type == "enhanced":
        content = pipeline_file.enhanced
    elif content_type == "exported":
        content = pipeline_file.exported
    elif content_type == "wts":
        # Serve raw .wts text if available
        from config.settings import get_file_output_folder
        base_name = Path(pipeline_file.filename).stem
        # Prefer path recorded in audioMetadata
        wts_path = None
        try:
            wts_path = pipeline_file.audioMetadata.get("wts_path") if pipeline_file.audioMetadata else None
        except Exception:
            wts_path = None
        if not wts_path:
            wts_path = str(get_file_output_folder(pipeline_file.filename) / f"{base_name}.wts")
        wts_p = Path(wts_path)
        if not wts_p.exists():
            raise HTTPException(status_code=404, detail="No wts file available")
        try:
            content = wts_p.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read wts file: {e}")
    else:
        raise HTTPException(status_code=400, detail="Invalid content type")

    if content is None:
        raise HTTPException(status_code=404, detail=f"No {content_type} content available")

    return JSONResponse(
        content={"content": content, "type": content_type},
        media_type="application/json"
    )

@router.get("/{file_id}/audio/{which}")
async def get_file_audio(file_id: str, which: str, request: Request):
    """
    Stream audio for a file. `which` can be:
    - processed: the processed.wav (or *_processed.wav) artifact if available
    - original: the original uploaded audio
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")

    from config.settings import get_file_output_folder
    file_folder = get_file_output_folder(pipeline_file.filename)

    path: Path | None = None
    if which == "processed":
        # Prefer explicit metadata path
        try:
            p = pipeline_file.audioMetadata.get("processed_wav_path") if pipeline_file.audioMetadata else None
        except Exception:
            p = None
        if p:
            cand = Path(p)
            if cand.exists():
                path = cand
        if path is None:
            # Look for processed.wav first, then *_processed.wav
            cand1 = file_folder / "processed.wav"
            if cand1.exists():
                path = cand1
            else:
                matches = list(file_folder.glob("*_processed.wav"))
                if matches:
                    path = matches[0]
    elif which == "original":
        path = Path(pipeline_file.path)
    else:
        raise HTTPException(status_code=400, detail="Invalid audio type")

    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Requested audio not available")

    # Derive media type by extension
    ext = path.suffix.lower()
    media = "audio/wav" if ext in [".wav"] else (
        "audio/mp4" if ext in [".m4a", ".mp4"] else "application/octet-stream"
    )
    # Common headers
    common_headers = {
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Content-Disposition": f"inline; filename=\"{path.name}\"",
        "Cache-Control": "no-store, max-age=0",
    }

    # If client requested a byte range, serve 206 with Content-Range
    range_header = request.headers.get("range") or request.headers.get("Range")
    file_size = path.stat().st_size
    if range_header and range_header.startswith("bytes="):
        try:
            range_value = range_header.split("=", 1)[1]
            start_s, end_s = range_value.split("-", 1)
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
            start = max(0, start)
            end = min(file_size - 1, end)
            length = end - start + 1
            def iter_file(p: Path, offset: int, length: int, chunk_size: int = 1024 * 64):
                with p.open("rb") as f:
                    f.seek(offset)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(chunk_size, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk
            headers = dict(common_headers)
            headers.update({
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(length),
            })
            return StreamingResponse(iter_file(path, start, length), status_code=206, media_type=media, headers=headers)
        except Exception:
            # Fall back to full response if parsing fails
            pass

    # No (valid) Range header: send full file
    headers = dict(common_headers)
    headers.update({"Content-Length": str(file_size)})
    return FileResponse(str(path), media_type=media, filename=path.name, headers=headers)

@router.get("/{file_id}/srt")
async def get_file_srt(file_id: str):
    """
    Return the human SRT subtitle text if present (CLI -osrt output).
    We no longer synthesize SRT from JSON; the editor uses word_timings.json instead.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    from config.settings import get_file_output_folder
    file_folder = get_file_output_folder(pipeline_file.filename)

    # Serve on-disk SRT only
    srts = list(file_folder.glob("*.srt"))
    if srts:
        try:
            txt = srts[0].read_text(encoding="utf-8", errors="ignore")
            return PlainTextResponse(txt, media_type="text/plain; charset=utf-8", headers={"Access-Control-Allow-Origin": "*"})
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read SRT: {e}")

    raise HTTPException(status_code=404, detail="No SRT available; use word_timings instead")


@router.get("/{file_id}/word_timings")
async def get_file_word_timings(file_id: str):
    """
    Return compact per-word timings JSON for the editor.
    If word_timings.json exists, return it; otherwise synthesize from JSON-full.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    from config.settings import get_file_output_folder
    folder = get_file_output_folder(pipeline_file.filename)

    wt_path = None
    try:
        wt_path = pipeline_file.audioMetadata.get("word_timings_path") if pipeline_file.audioMetadata else None
    except Exception:
        wt_path = None
    if wt_path:
        p = Path(wt_path)
        if p.exists():
            try:
                txt = p.read_text(encoding='utf-8', errors='ignore')
                return JSONResponse(content=__import__('json').loads(txt), headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"})
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to read word_timings.json: {e}")

    # Synthesize from JSON-full
    # Reuse the timeline parsing to get tokens and then join into words
    base = await get_file_timeline(file_id)
    tokens = base.get('tokens', [])
    if not tokens:
        raise HTTPException(status_code=404, detail="No tokens available to build word timings")

    def is_control(s: str) -> bool:
        return s.startswith('[_') and s.endswith('_]')
    def punct_only(s: str) -> bool:
        st = s.strip()
        return st != '' and all(not ch.isalnum() for ch in st)

    words = []
    cur_txt = ''
    cur_s = None
    cur_e = None
    def flush():
        nonlocal words, cur_txt, cur_s, cur_e
        if cur_txt:
            s = float(cur_s or 0.0); e = float(cur_e or cur_s or 0.0)
            words.append({ 'token_id': len(words), 'word': cur_txt, 'start': max(0.0, s), 'end': max(s, e) })
            cur_txt = ''; cur_s = None; cur_e = None

    for t in tokens:
        txt = str(t.get('text') or '')
        if is_control(txt):
            flush();
            continue
        starts_new = txt.startswith(' ') or txt.startswith('\t') or txt.startswith('\n') or punct_only(txt)
        stripped = txt.strip()
        if starts_new:
            flush()
        if not stripped or punct_only(stripped):
            flush();
            continue
        if not cur_txt:
            cur_txt = stripped; cur_s = t.get('start'); cur_e = t.get('end')
        else:
            cur_txt += stripped; cur_e = max(float(cur_e or 0.0), float(t.get('end') or 0.0))
    flush()

    if not words:
        raise HTTPException(status_code=404, detail="Failed to synthesize word timings from tokens")

    audio_dur = max((w['end'] for w in words), default=0.0)
    wt = { 'version': '1', 'audio': { 'processed_wav': 'processed.wav', 'duration_sec': audio_dur }, 'dtw_model': None, 'segments': [ { 'idx': 0, 'start': words[0]['start'], 'end': words[-1]['end'], 'words': words } ] }
    try:
        import json as _json
        (folder / 'word_timings.json').write_text(_json.dumps(wt, ensure_ascii=False, indent=2), encoding='utf-8')
        status_tracker.add_audio_metadata(file_id, {"word_timings_path": str(folder / 'word_timings.json')})
    except Exception:
        pass

    return JSONResponse(content=wt, headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"})


@router.get("/{file_id}/timeline")
async def get_file_timeline(file_id: str):
    """
    Return word-level timeline from the Whisper JSON produced during transcription.
    Output format: { tokens: [{ text, start, end }], src: 'json' }
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")

    from config.settings import get_file_output_folder
    folder = get_file_output_folder(pipeline_file.filename)

    # Resolve json path from metadata or guess in folder
    jpath = None
    try:
        jpath = pipeline_file.audioMetadata.get("json_path") if pipeline_file.audioMetadata else None
    except Exception:
        jpath = None
    if not jpath:
        # Try to find any .json next to artifacts
        candidates = list(folder.glob("*.json"))
        if candidates:
            jpath = str(candidates[0])
    if not jpath:
        raise HTTPException(status_code=404, detail="No JSON timing file recorded for this item")

    p = Path(jpath)
    if not p.exists():
        raise HTTPException(status_code=404, detail="JSON timing file path not found")

    import json as _json
    try:
        data = _json.loads(p.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON: {e}")

    tokens = []

    def seconds_from_fields(tok: dict):
        # Support t0/t1 frame indices (10ms frames typical) or start/end in seconds/ms
        if 't0' in tok and 't1' in tok:
            # Heuristic: treat frames as 10ms
            t0 = float(tok.get('t0', 0)) * 0.01
            t1 = float(tok.get('t1', 0)) * 0.01
            return t0, max(t0, t1)
        if 'start' in tok or 'end' in tok:
            s = float(tok.get('start', 0))
            e = float(tok.get('end', s))
            # If values look like ms, convert to seconds
            if e > 1e4:
                s /= 1000.0
                e /= 1000.0
            return s, max(s, e)
        return None

    # Common whisper JSON structures
    try:
        # Structure A: whisper.cpp standard (segments with tokens/words)
        segs = data.get('segments') or []
        for seg in segs:
            tok_list = seg.get('tokens') or seg.get('words') or []
            for tok in tok_list:
                txt = tok.get('text') or tok.get('word') or ''
                ts = seconds_from_fields(tok)
                if ts:
                    s, e = ts
                    tokens.append({ 'text': txt, 'start': float(max(0.0, s)), 'end': float(max(s, e)) })
            if not tok_list and 'text' in seg and 'start' in seg and 'end' in seg:
                s = float(seg.get('start', 0)); e = float(seg.get('end', s))
                if e > 1e4: s/=1000.0; e/=1000.0
                txt = (seg.get('text') or '').strip()
                if txt:
                    tokens.append({ 'text': txt, 'start': s, 'end': e })
        # Structure B: your pipeline (top-level "transcription" array with tokens)
        if not tokens and isinstance(data.get('transcription'), list):
            for item in data['transcription']:
                toks = item.get('tokens') or []
                for tok in toks:
                    txt = tok.get('text') or tok.get('word') or ''
                    # Prefer offsets in ms if available
                    off = tok.get('offsets')
                    if isinstance(off, dict) and ('from' in off or 'to' in off):
                        s = float(off.get('from', 0)) / 1000.0
                        e = float(off.get('to', off.get('from', 0))) / 1000.0
                        tokens.append({ 'text': txt, 'start': s, 'end': max(s, e) })
                        continue
                    # Else parse timestamps strings "00:00:00,000"
                    tsd = tok.get('timestamps')
                    if isinstance(tsd, dict) and ('from' in tsd or 'to' in tsd):
                        def parse_tc(tc: str) -> float:
                            tc = str(tc)
                            hms, ms = tc.split(',') if ',' in tc else (tc, '0')
                            h, m, s = [float(x) for x in hms.split(':')]
                            return h*3600 + m*60 + s + float(ms)/1000.0
                        s = parse_tc(tsd.get('from', '00:00:00,000'))
                        e = parse_tc(tsd.get('to', '00:00:00,000'))
                        tokens.append({ 'text': txt, 'start': s, 'end': max(s, e) })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read tokens: {e}")

    if not tokens:
        raise HTTPException(status_code=404, detail="No token timings found in JSON")

    return { 'src': 'json', 'tokens': tokens }

@router.put("/{file_id}/transcript")
async def update_transcript(file_id: str, content: dict):
    """
    Update the transcript content for a file
    Allows manual editing of transcripts
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if "transcript" not in content:
        raise HTTPException(status_code=400, detail="Missing 'transcript' field in request body")
    
    try:
        # Update the transcript content
        pipeline_file.transcript = content["transcript"]
        
        # Save updated status
        status_tracker.save_file_status(file_id)
        
        return {
            "success": True,
            "message": f"Successfully updated transcript for {pipeline_file.filename}",
            "file": pipeline_file
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update transcript: {str(e)}")

@router.put("/{file_id}/sanitised")
async def update_sanitised(file_id: str, content: dict):
    """
    Update the sanitised text for a file without touching the original transcript.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")

    if "sanitised" not in content:
        raise HTTPException(status_code=400, detail="Missing 'sanitised' field in request body")

    try:
        pipeline_file.sanitised = content["sanitised"]
        status_tracker.save_file_status(file_id)
        return {
            "success": True,
            "message": f"Successfully updated sanitised text for {pipeline_file.filename}",
            "file": pipeline_file
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update sanitised text: {str(e)}")

@router.post("/{file_id}/sanitise/cancel")
async def cancel_sanitise(file_id: str):
    """
    Cancel/reset the sanitise step only, without affecting other steps.
    Useful when the user dismisses the disambiguation dialog.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    from models import ProcessingStatus
    # Set sanitise to pending and clear sanitised text for a clean rerun
    try:
        pipeline_file.steps.sanitise = ProcessingStatus.PENDING
        pipeline_file.sanitised = None
        status_tracker.save_file_status(file_id)
        return { 'success': True, 'message': 'Sanitise step reset to pending' }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel sanitise: {e}")

@router.post("/{file_id}/reset")
async def reset_file(file_id: str):
    """
    Reset file processing status (for retry operations)
    Clears error status and resets steps to pending
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # Reset all steps to pending
        from models import ProcessingSteps, ProcessingStatus
        pipeline_file.steps = ProcessingSteps()
        
        # Clear error information
        pipeline_file.error = None
        pipeline_file.errorDetails = None
        
        # Clear processing results (keep transcript if it exists)
        if pipeline_file.steps.transcribe != ProcessingStatus.DONE:
            pipeline_file.transcript = None
        pipeline_file.sanitised = None
        pipeline_file.enhanced = None
        pipeline_file.exported = None
        
        # Save updated status
        status_tracker.save_file_status(file_id)
        
        return {
            "success": True,
            "message": f"Successfully reset {pipeline_file.filename}",
            "file": pipeline_file
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset file: {str(e)}")
