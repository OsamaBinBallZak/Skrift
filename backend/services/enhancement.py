"""
Enhancement service
Handles AI enhancement with MLX models and streaming
"""

import time
import asyncio
import threading
import re
import subprocess
import json as _json
import os
import datetime as _dt
import re as _re
import logging
from pathlib import Path
from config.settings import settings
from services.mlx_runner import generate_with_mlx, stream_with_mlx, stream_vision_with_mlx, plan_generation, MLXNotAvailable
from utils.status_tracker import status_tracker, ProcessingStatus

logger = logging.getLogger(__name__)

# Track active streams to prevent concurrent encodes per file
ACTIVE_ENHANCE_STREAMS: set[str] = set()


def build_enhancement_context(file_id: str) -> str:
    """
    Build combined input text for enhancement, incorporating shared content context.
    For regular voice memos, returns the transcript as-is (unchanged behavior).
    For capture items, prepends shared content context before the annotation.
    """
    pf = status_tracker.get_file(file_id)
    if not pf:
        return ""

    base_text = pf.sanitised or pf.transcript or ""
    shared = (pf.audioMetadata or {}).get('shared_content')
    if not shared:
        return base_text

    preamble_parts = []
    share_type = shared.get('type', '')

    if share_type == 'url':
        url = shared.get('url', '')
        title = shared.get('urlTitle', '')
        preamble_parts.append(f"[Shared URL: {url}]")
        if title:
            preamble_parts.append(f"[Page title: {title}]")
        desc = shared.get('urlDescription', '')
        if desc:
            preamble_parts.append(f"[Description: {desc[:300]}]")
    elif share_type == 'image':
        fname = shared.get('fileName', 'image')
        preamble_parts.append(f"[Shared image: {fname}]")
    elif share_type == 'text':
        snippet = shared.get('text', '')
        if snippet:
            preamble_parts.append(f"[Shared text: {snippet[:500]}]")
    elif share_type == 'file':
        fname = shared.get('fileName', 'file')
        preamble_parts.append(f"[Shared file: {fname}]")

    if not preamble_parts:
        return base_text

    context = "\n".join(preamble_parts)
    if base_text:
        return f"{context}\n\nAnnotation:\n{base_text}"
    return context


async def _schedule_idle_cache_clear():
    """
    Wait 10 seconds after enhancement completes, then clear MLX cache if still idle.
    Only runs in manual mode - batch mode clears cache explicitly.
    """
    await asyncio.sleep(10)
    
    try:
        from services.mlx_cache import get_model_cache
        cache = get_model_cache()
        
        if cache.should_clear_idle_cache(idle_timeout_seconds=10):
            cache.clear_cache(reason="10s idle after manual enhancement")
            logger.info("✅ MLX model auto-unloaded after 10s idle (manual mode)")
    except Exception as e:
        logger.error(f"Failed to auto-clear MLX cache: {e}")


def preserve_brackets(source: str, output: str) -> str:
    """
    Ensure any [[...]] tokens from source are preserved verbatim in output.
    Strategy: for each unique inner token from source, if [[token]] not in out,
    replace standalone occurrences of token in out with [[token]] (case-sensitive first,
    then case-insensitive fallback). Avoid double-bracketing.
    """
    if not source or not output:
        return output
    
    tokens = []
    try:
        for m in re.finditer(r"\[\[([^\]]+)\]\]", source):
            inner = m.group(1).strip()
            if inner and inner not in tokens:
                tokens.append(inner)
    except Exception:
        return output
    
    fixed = output
    for tok in tokens:
        if f"[[{tok}]]" in fixed:
            continue
        # Protect already-bracketed segments and brackets themselves
        try:
            # Case-sensitive first
            pattern_cs = re.compile(rf"(?<!\[\[)\b{re.escape(tok)}\b(?!\]\])")
            fixed_cs, n_cs = pattern_cs.subn(f"[[{tok}]]", fixed)
            fixed = fixed_cs
            if n_cs == 0:
                # Case-insensitive fallback: preserve original casing in replacement text
                def repl(m):
                    return "[[" + m.group(0) + "]]"
                pattern_ci = re.compile(rf"(?<!\[\[)\b{re.escape(tok)}\b(?!\]\])", re.IGNORECASE)
                fixed = pattern_ci.sub(repl, fixed)
        except Exception:
            # Best-effort: do not break output
            continue
    return fixed


def test_model() -> dict:
    """
    Quick test to validate the currently selected MLX model loads and can generate text.
    Returns dict with sample output, timing, and model info.
    Raises MLXNotAvailable or ValueError if test fails.
    """
    from pathlib import Path
    from config.settings import get_mlx_models_path

    mlx_cfg = settings.get('enhancement.mlx') or {}
    model_path = (mlx_cfg.get('model_path') or '').strip()
    if not model_path:
        raise ValueError("MLX model not selected. Set one in Settings > Enhancement.")
    if not Path(model_path).exists():
        raise ValueError(f"Model folder not found: {Path(model_path).name}. Check Settings > Enhancement.")

    # Enforce that the selected model lives under the current dependencies_folder/models/mlx
    models_root = get_mlx_models_path()
    try:
        p = Path(model_path).resolve()
        root = models_root.resolve()
        if root not in p.parents and p != root:
            raise MLXNotAvailable(
                "Selected MLX model is outside the current dependencies folder. "
                "After changing Dependencies Folder in Settings > Paths, please re-select a model in Settings > Enhancement."
            )
    except MLXNotAvailable:
        raise
    except Exception:
        # If resolution fails for any reason, fall back to the lower-level checks in mlx_runner
        pass

    prompt = "You are a minimal test. Respond with a single short line confirming MLX works."
    t0 = time.time()
    
    # Prepare plan first for visibility
    plan = plan_generation(
        prompt=prompt,
        input_text="Hello",
        model_path=model_path,
        max_tokens=int(mlx_cfg.get('max_tokens', 64)),
        temperature=float(mlx_cfg.get('temperature', 0.7)),
    )
    sample = generate_with_mlx(
        prompt=prompt,
        input_text="",
        model_path=model_path,
        max_tokens=int(mlx_cfg.get('max_tokens', 64)),
        temperature=float(mlx_cfg.get('temperature', 0.7)),
        timeout_seconds=int(mlx_cfg.get('timeout_seconds', 20))
    )

    elapsed = time.time() - t0
    return {
        "selected": model_path,
        "elapsed_seconds": round(elapsed, 3),
        "sample": (sample or "").splitlines()[0][:200],
        "used_chat_template": plan.get("used_chat_template"),
        "effective_max_tokens": plan.get("effective_max_tokens"),
        "prompt_preview": plan.get("prompt_preview"),
    }


def generate_enhancement(file_id: str, text: str, prompt: str, preset: str = "polish") -> dict:
    """
    Generate synchronous enhancement for text using MLX.
    
    Args:
        file_id: file identifier
        text: source text to enhance
        prompt: enhancement prompt
        preset: enhancement preset name
    
    Returns:
        dict with:
        - status: 'done' or 'error'
        - enhanced: enhanced text (if done)
        - processing_time: time taken in seconds (if done)
        - error: error message (if error)
    """
    try:
        # Validate MLX availability
        mlx_cfg = settings.get('enhancement.mlx') or {}
        model_path = (mlx_cfg.get('model_path') or '').strip()
        if not model_path:
            return {
                'status': 'error',
                'error': 'MLX model not selected'
            }
        if not Path(model_path).exists():
            return {
                'status': 'error',
                'error': f'Model folder not found: {Path(model_path).name}. Check Settings > Enhancement.'
            }
        if not prompt:
            return {
                'status': 'error',
                'error': 'Prompt not provided'
            }

        # Enforce that selected model stays under dependencies_folder/models/mlx
        from pathlib import Path
        from config.settings import get_mlx_models_path

        models_root = get_mlx_models_path()
        try:
            p = Path(model_path).resolve()
            root = models_root.resolve()
            if root not in p.parents and p != root:
                return {
                    'status': 'error',
                    'error': 'Selected MLX model is outside the current dependencies folder. After changing Dependencies Folder in Settings > Paths, re-select a model in Settings > Enhancement.'
                }
        except Exception:
            # If resolution fails, let generate_with_mlx perform its own checks
            pass

        # Generate with MLX
        start_time = time.time()
        enhanced = generate_with_mlx(
            prompt=prompt,
            input_text=text,
            model_path=model_path,
            max_tokens=int(mlx_cfg.get('max_tokens', 512)),
            temperature=float(mlx_cfg.get('temperature', 0.7)),
            timeout_seconds=int(mlx_cfg.get('timeout_seconds', 45))
        )
        
        # Enforce preservation of [[...]] tokens from source text
        enhanced = preserve_brackets(text, enhanced)
        processing_time = time.time() - start_time

        return {
            'status': 'done',
            'enhanced': enhanced,
            'processing_time': processing_time
        }
    
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }


def _get_image_manifest(file_id: str):
    """Load image manifest for a file, or return None if no images."""
    pf = status_tracker.get_file(file_id)
    if not pf:
        return None
    file_folder = Path(pf.path).parent
    manifest_path = file_folder / "image_manifest.json"
    if not manifest_path.exists():
        return None
    try:
        return _json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _get_image_path(file_id: str, img_num: int) -> str | None:
    """Resolve the file path for img_XXX in a file's images/ folder."""
    pf = status_tracker.get_file(file_id)
    if not pf:
        return None
    file_folder = Path(pf.path).parent
    manifest = _get_image_manifest(file_id)
    if not manifest:
        return None
    # img_num is 1-indexed, manifest is 0-indexed
    idx = img_num - 1
    if idx < 0 or idx >= len(manifest):
        return None
    filename = manifest[idx].get("filename")
    if not filename:
        return None
    img_path = file_folder / "images" / filename
    return str(img_path) if img_path.exists() else None


def hybrid_copy_edit_stream(file_id: str, input_text: str, text_prompt: str, model_path: str, mlx_cfg: dict):
    """
    Generator that yields (event_type, data) tuples for hybrid copy-edit.
    Splits transcript by [[img_XXX]] markers. Vision segments get per-segment
    enhancement with the actual photo. Text-only segments get standard copy-edit.
    """
    import re as _re_split

    vision_prompt = settings.get('enhancement.prompts.vision_copy_edit') or \
        "Clean up this transcript segment. You can see the photo the speaker took here.\nFix grammar, remove filler words. Add ONE short factual observation from the photo, naturally woven into the text.\nKeep the [[img_XXX]] marker exactly as-is.\nOutput only the enhanced text."

    # Split text into alternating segments and markers
    parts = _re_split.split(r'(\[\[img_\d{3}\]\])', input_text)
    manifest = _get_image_manifest(file_id)

    if not manifest or not any(_re_split.match(r'\[\[img_\d{3}\]\]', p) for p in parts):
        # No image markers found — fall back to standard text-only stream
        for piece in stream_with_mlx(
            prompt=text_prompt, input_text=input_text,
            model_path=model_path,
            max_tokens=int(mlx_cfg.get('max_tokens', 512)),
            temperature=float(mlx_cfg.get('temperature', 0.7)),
        ):
            yield ("token", piece)
        return

    max_tokens = int(mlx_cfg.get('max_tokens', 512))
    temperature = float(mlx_cfg.get('temperature', 0.7))
    result_parts = []

    for i, part in enumerate(parts):
        marker_match = _re_split.match(r'\[\[img_(\d{3})\]\]', part)

        if marker_match:
            # This is an image marker — keep it as-is in output
            result_parts.append(part)
            yield ("token", part)

        elif part.strip():
            # Check if adjacent to an image marker (previous or next part is a marker)
            prev_is_marker = i > 0 and _re_split.match(r'\[\[img_(\d{3})\]\]', parts[i-1])
            next_is_marker = i + 1 < len(parts) and _re_split.match(r'\[\[img_(\d{3})\]\]', parts[i+1])

            # Find the relevant image number for this segment
            img_num = None
            if prev_is_marker:
                img_num = int(prev_is_marker.group(1))
            elif next_is_marker:
                img_num = int(next_is_marker.group(1))

            img_path = _get_image_path(file_id, img_num) if img_num else None

            if img_path:
                # Vision enhancement: this segment is near an image marker
                yield ("vision_start", f"img_{img_num:03d}")
                segment_text = part.strip()

                # Include the marker in context so the model can position it
                if prev_is_marker:
                    segment_text = f"[[img_{img_num:03d}]]\n\n{segment_text}"
                elif next_is_marker:
                    segment_text = f"{segment_text}\n\n[[img_{img_num:03d}]]"

                segment_acc = []
                for piece in stream_vision_with_mlx(
                    prompt=vision_prompt,
                    input_text=segment_text,
                    image_path=img_path,
                    model_path=model_path,
                    max_tokens=max_tokens,
                    temperature=temperature,
                ):
                    segment_acc.append(piece)
                    yield ("token", piece)

                enhanced_segment = ''.join(segment_acc)
                # Remove duplicate markers from the vision output (model may echo them)
                enhanced_segment = _re_split.sub(r'\[\[img_\d{3}\]\]\s*', '', enhanced_segment).strip()
                result_parts.append(enhanced_segment)
            else:
                # Text-only enhancement
                segment_acc = []
                for piece in stream_with_mlx(
                    prompt=text_prompt, input_text=part.strip(),
                    model_path=model_path,
                    max_tokens=max_tokens,
                    temperature=temperature,
                ):
                    segment_acc.append(piece)
                    yield ("token", piece)
                result_parts.append(''.join(segment_acc))

        else:
            # Empty segment (whitespace between markers)
            result_parts.append(part)

    # Yield the reassembled final text
    final = '\n\n'.join(p for p in result_parts if p.strip())
    yield ("done", final)


async def generate_enhancement_stream(file_id: str, input_text: str, prompt: str, step: str = ""):
    """
    Generate SSE stream for enhancement using MLX.
    Yields SSE-formatted events: start, plan, stats, token, done, error.
    
    Args:
        file_id: file identifier
        input_text: source text to enhance
        prompt: enhancement prompt
    
    Yields:
        SSE-formatted string events
    """
    # Concurrency guard
    if file_id in ACTIVE_ENHANCE_STREAMS:
        raise RuntimeError("Enhancement stream already in progress for this file")
    ACTIVE_ENHANCE_STREAMS.add(file_id)

    try:
        # Helper to emit SSE with proper multi-line data framing
        def _sse(event: str, data: str) -> str:
            # Split payload into lines per SSE spec (one data: line per line)
            lines = (data or "").splitlines()
            buf = [f"event: {event}\n"]
            if not lines:
                buf.append("data: \n")
            else:
                for ln in lines:
                    buf.append(f"data: {ln}\n")
            buf.append("\n")
            return ''.join(buf)

        # Clear any stale enhance error without changing step status
        try:
            status_tracker.clear_error(file_id)
        except Exception:
            pass
        
        # Start
        yield _sse("start", "")

        # Resolve model path
        from pathlib import Path
        from config.settings import get_mlx_models_path

        mlx_cfg = settings.get('enhancement.mlx') or {}
        model_path = (mlx_cfg.get('model_path') or '').strip()
        if not model_path:
            yield _sse("error", "MLX model not selected. Set one in Settings > Enhancement.")
            return
        if not Path(model_path).exists():
            yield _sse("error", f"Model folder not found: {Path(model_path).name}. Check Settings > Enhancement.")
            return

        # Enforce that model_path lives under the current dependencies_folder/models/mlx
        try:
            models_root = get_mlx_models_path()
            p = Path(model_path).resolve()
            root = models_root.resolve()
            if root not in p.parents and p != root:
                yield _sse("error", "Selected MLX model is outside the current dependencies folder. After changing Dependencies Folder in Settings > Paths, re-select a model in Settings > Enhancement.")
                return
        except Exception:
            # If resolution fails, downstream MLX calls will emit a clearer error
            pass

        # Emit plan/debug info first (full metrics) and a separate ping-able stats event
        try:
            import json as _json
            plan = plan_generation(
                prompt=prompt or "You are an assistant that enhances transcripts.",
                input_text=input_text,
                model_path=model_path,
                max_tokens=int(mlx_cfg.get('max_tokens', 512)),
                temperature=float(mlx_cfg.get('temperature', 0.7)),
            )
            yield _sse("plan", _json.dumps(plan))
            # Also send a stats snapshot (input length, dynamic budget)
            stats = {
                'input_length': len(input_text or ''),
                'effective_max_tokens': plan.get('effective_max_tokens'),
                'used_chat_template': plan.get('used_chat_template')
            }
            yield _sse("stats", _json.dumps(stats))
        except Exception:
            pass

        # Use vision pipeline ONLY for copy-edit on files that have timestamped images.
        # The `step` parameter tells us which enhancement step this is.
        # The file's audioMetadata.has_images flag (set during upload) tells us if images exist.
        _has_images = _get_image_manifest(file_id) is not None
        _step_lower = (step or '').lower()
        _use_vision = _has_images and _step_lower in ('copy_edit', 'copyedit', 'copy edit')

        # Try true streaming first
        try:
            if _use_vision:
                logger.info(f"Enhance stream: using HYBRID vision pipeline for {file_id}")
            else:
                logger.info("Enhance stream: attempting true MLX streaming")
            acc = []  # collector fed by model thread
            sse_chunks = []  # authoritative stream buffer of what we actually emitted

            async def stream_tokens():
                # stream_with_mlx is a regular generator; iterate in thread to avoid blocking loop
                loop_acc = {"error": None}

                def run_and_collect():
                    try:
                        if _use_vision:
                            # Hybrid: vision for image segments, text-only for the rest
                            logger.info(f"Starting hybrid_copy_edit_stream for file {file_id}")
                            for evt_type, piece in hybrid_copy_edit_stream(
                                file_id=file_id,
                                input_text=input_text,
                                text_prompt=prompt or "You are an assistant that enhances transcripts.",
                                model_path=model_path,
                                mlx_cfg=mlx_cfg,
                            ):
                                if evt_type == "token":
                                    acc.append(piece)
                                elif evt_type == "done":
                                    # Store the reassembled final text
                                    acc.append(f"\n__HYBRID_FINAL__\n{piece}")
                                # vision_start events are for progress only
                        else:
                            logger.info(f"Starting stream_with_mlx for file {file_id}")
                            for piece in stream_with_mlx(
                                prompt=prompt or "You are an assistant that enhances transcripts.",
                                input_text=input_text,
                                model_path=model_path,
                                max_tokens=int(mlx_cfg.get('max_tokens', 512)),
                                temperature=float(mlx_cfg.get('temperature', 0.7)),
                            ):
                                acc.append(piece)
                        logger.info(f"Stream completed for file {file_id}, got {len(acc)} pieces")
                    except Exception as e:
                        logger.error(f"MLX stream failed for {file_id}: {e}", exc_info=True)
                        loop_acc["error"] = str(e)
                
                th = threading.Thread(target=run_and_collect, daemon=True)
                th.start()
                
                # Flush buffer periodically while thread runs (no heartbeats)
                last_idx = 0
                while th.is_alive():
                    if len(acc) > last_idx:
                        chunk = ''.join(acc[last_idx:])
                        last_idx = len(acc)
                        if chunk:
                            sse_chunks.append(chunk)
                            yield _sse("token", chunk)
                    await asyncio.sleep(0.02)
                
                # Flush tail
                if len(acc) > last_idx:
                    chunk = ''.join(acc[last_idx:])
                    if chunk:
                        sse_chunks.append(chunk)
                        yield _sse("token", chunk)
                
                if loop_acc["error"]:
                    raise RuntimeError(loop_acc["error"])
            
            async for evt in stream_tokens():
                yield evt
            
            # Build final strictly from what we actually emitted as tokens
            # For hybrid pipeline, use the reassembled final text from the generator
            all_acc = ''.join(acc)
            if '__HYBRID_FINAL__' in all_acc:
                final = all_acc.split('__HYBRID_FINAL__\n', 1)[-1]
            else:
                final = ''.join(sse_chunks) if sse_chunks else all_acc
        except Exception as e:
            # Streaming failed. Do not persist this as a pipeline error; surface to client only.
            err = f"Streaming not available: {e}"
            yield _sse("error", err)
            return

        # Send done exactly as generated (no post-processing), to match the live stream
        yield _sse("done", final)
        
        # Schedule cache clearing after 10 seconds idle (manual mode only)
        # Batch mode clears cache explicitly at batch end
        asyncio.create_task(_schedule_idle_cache_clear())
    
    finally:
        # Release lock regardless of outcome
        try:
            ACTIVE_ENHANCE_STREAMS.discard(file_id)
        except Exception:
            pass


# =========================
# Compile / Auto-compile
# =========================

async def score_importance_for_file(file_id: str):
    """Score importance and persist to status.json. Call after summary, before tags."""
    pf = status_tracker.get_file(file_id)
    if not pf:
        return
    text = pf.enhanced_copyedit or pf.sanitised or pf.transcript or ''
    if not text:
        return
    score = _score_importance(text)
    if score is not None:
        pf.significance = score
        status_tracker.save_file_status(file_id)
        logger.info(f"Importance scored for {file_id}: {score}")


def _all_enhancement_parts_present(pf) -> bool:
    """Return True when tags have been applied — tags are the final user-confirmed step.
    Title, copy edit and summary are compiled if present but are not required to trigger compile."""
    return bool(pf.enhanced_tags or [])


def _score_importance(text: str) -> float | None:
    """Ask the LLM to rate personal significance of the text (0.0-1.0).

    Returns None if the model is unavailable or the output can't be parsed.
    """
    prompt = settings.get('enhancement.prompts.importance')
    if not prompt:
        return None
    model_path = settings.get('enhancement.mlx.model_path')
    if not model_path:
        return None
    try:
        raw = generate_with_mlx(
            prompt=prompt,
            input_text=text[:2000],  # cap input to keep it fast
            model_path=model_path,
            max_tokens=8,
            temperature=0.1,  # deterministic
            timeout_seconds=15,
        )
        # Extract the first float-like number from the output
        m = _re.search(r'(0(?:\.\d+)?|1(?:\.0+)?)', raw.strip())
        if m:
            return round(float(m.group(1)), 2)
    except Exception as e:
        logger.warning(f"Importance scoring failed for {text[:30]}…: {e}")
    return None


async def compile_file(file_id: str) -> dict:
    """
    Core compile logic: assembles Obsidian-ready markdown from status.json fields.
    Returns {'success': True, 'compiled_path': str} or raises on error.
    """
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise ValueError(f"File not found: {file_id}")

    is_note = pf.source_type == 'note'

    date_str = None
    if not is_note:
        try:
            cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", pf.path]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
            if res.returncode == 0:
                info = _json.loads(res.stdout or '{}')
                tags_meta = (info.get('format') or {}).get('tags') or {}
                ctime = tags_meta.get('creation_time') or tags_meta.get('com.apple.quicktime.creationdate')
                if ctime:
                    date_str = ctime[:10]
        except Exception:
            pass
    try:
        if not date_str:
            st = os.stat(pf.path)
            ts = st.st_mtime if is_note else getattr(st, 'st_birthtime', st.st_mtime)
            date_str = _dt.datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
    except Exception:
        date_str = None

    folder = Path(pf.path).parent
    working = pf.enhanced_copyedit or pf.sanitised or pf.transcript or ''
    summary = pf.enhanced_summary or ''
    tags = pf.enhanced_tags or []

    raw_stem = pf.filename.rsplit('.', 1)[0].rstrip('.')
    note_title_meta = (pf.audioMetadata or {}).get('note_title') if is_note else None
    title_str = (pf.enhanced_title or '').strip() or note_title_meta or raw_stem
    # Determine source string
    shared_content = audio_meta.get('shared_content') or {}
    is_capture = pf.source_type == 'capture' or bool(shared_content)
    if is_note:
        source_str = 'Apple-Note'
    elif is_capture:
        share_type = shared_content.get('type', 'unknown')
        source_str = f'Capture-{share_type.capitalize()}'
    else:
        source_str = 'Voice-memo'

    author = (settings.get('export.author') or '').strip()

    # Extract phone metadata from audioMetadata (mobile recordings)
    audio_meta = pf.audioMetadata or {}
    phone_location = audio_meta.get('phone_location') or {}
    phone_weather = audio_meta.get('phone_weather') or {}
    phone_pressure = audio_meta.get('phone_pressure') or {}
    phone_day_period = audio_meta.get('phone_day_period')
    phone_daylight = audio_meta.get('phone_daylight') or {}
    phone_steps = audio_meta.get('phone_steps')

    # Build location string: prefer phone location placeName, fall back to empty
    location_str = ''
    if phone_location.get('placeName'):
        location_str = phone_location['placeName']

    yaml_lines = [
        '---',
        f'title: {title_str}',
        f'date: {date_str or ""}',
        'lastTouched:',
        f'author: {author}',
        f'source: {source_str}',
        f'location: "{location_str}"' if location_str else 'location:',
    ]

    # Add phone metadata fields when available
    if phone_weather.get('conditions') is not None and phone_weather.get('temperature') is not None:
        unit = phone_weather.get('temperatureUnit', '°C')
        yaml_lines.append(f'weather: "{phone_weather["conditions"]}, {phone_weather["temperature"]}{unit}"')

    if phone_pressure.get('hPa') is not None:
        yaml_lines.append(f'pressure: {phone_pressure["hPa"]}')
    if phone_pressure.get('trend'):
        yaml_lines.append(f'pressureTrend: {phone_pressure["trend"]}')

    if phone_day_period:
        yaml_lines.append(f'dayPeriod: {phone_day_period}')

    if phone_daylight.get('sunrise') and phone_daylight.get('sunset'):
        yaml_lines.append('daylight:')
        yaml_lines.append(f'  sunrise: "{phone_daylight["sunrise"]}"')
        yaml_lines.append(f'  sunset: "{phone_daylight["sunset"]}"')
        if phone_daylight.get('hoursOfLight') is not None:
            yaml_lines.append(f'  hoursOfLight: {phone_daylight["hoursOfLight"]}')

    if phone_steps is not None:
        yaml_lines.append(f'steps: {phone_steps}')

    yaml_lines.append('tags:')
    for t in tags:
        yaml_lines.append(f'  - {t}')
    # Use cached significance score (computed after summary, before tags)
    importance = pf.significance
    significance_line = f'significance: {importance}' if importance is not None else 'significance:'

    # Add capture-specific frontmatter
    if is_capture and shared_content:
        if shared_content.get('url'):
            yaml_lines.append(f'sourceUrl: "{shared_content["url"]}"')
        if shared_content.get('urlTitle'):
            yaml_lines.append(f'sourceTitle: "{shared_content["urlTitle"]}"')

    yaml_lines.extend([significance_line, 'summary:', '---', ''])
    if summary:
        yaml_lines[yaml_lines.index('summary:')] = f"summary: {summary}"

    # For capture items, prepend a source reference before the body content
    source_block = ''
    if is_capture and shared_content:
        st = shared_content.get('type', '')
        if st == 'url' and shared_content.get('url'):
            link_title = shared_content.get('urlTitle', shared_content['url'])
            source_block = f'\n> Source: [{link_title}]({shared_content["url"]})\n\n'
        elif st == 'image' and shared_content.get('fileName'):
            source_block = f'\n![[{shared_content["fileName"]}]]\n\n'
        elif st == 'text' and shared_content.get('text'):
            text_preview = shared_content['text'][:500]
            source_block = f'\n> {text_preview}\n\n'

    content = '\n'.join(yaml_lines) + source_block + working

    out_path = folder / 'compiled.md'
    out_path.write_text(content, encoding='utf-8')

    pf.compiled_text = content
    pf.lastModified = _dt.datetime.now()
    status_tracker.save_file_status(file_id)

    if _all_enhancement_parts_present(pf):
        status_tracker.update_file_status(file_id, 'enhance', ProcessingStatus.DONE)

    return {'success': True, 'compiled_path': str(out_path)}


async def auto_compile_if_complete(file_id: str):
    """Silently compile if all four enhancement parts are present. Never raises."""
    try:
        pf = status_tracker.get_file(file_id)
        if pf and _all_enhancement_parts_present(pf):
            await compile_file(file_id)
    except Exception:
        pass


# =========================
# Tag generation service
# =========================

def load_tag_whitelist() -> dict:
    """Load the tag whitelist from disk. Raises ValueError on read failure."""
    cfg = settings.get('enhancement.obsidian') or {}
    wl_path = (Path(cfg.get('tags_whitelist_path') or '')).expanduser()
    try:
        if wl_path and wl_path.exists():
            return _json.loads(wl_path.read_text(encoding='utf-8', errors='ignore'))
    except Exception as e:
        raise ValueError(f"Failed to read whitelist: {e}")
    return {'version': 1, 'count': 0, 'tags': []}


async def generate_tags_service(file_id: str) -> dict:
    """
    Generate tag suggestions using MLX. Returns suggestions only (does not persist the final selection).
    Returns {'success': True, 'old': [...], 'new': [...], 'raw': str, ...}
    Raises ValueError for user-facing errors.
    """
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise ValueError(f"File not found: {file_id}")

    text = pf.sanitised or pf.transcript or ''
    if not text:
        raise ValueError("No text available for tagging (need sanitised or transcript)")

    wl_data = load_tag_whitelist()
    wl_list = [str(t).strip() for t in wl_data.get('tags', []) if str(t).strip()]
    wl = {t.lower(): t for t in wl_list}
    if not wl:
        raise ValueError("Whitelist is empty; refresh it in settings")

    tag_cfg = settings.get('enhancement.tags') or {}
    max_old = int(tag_cfg.get('max_old', 10))
    max_new = int(tag_cfg.get('max_new', 5))
    selection_criteria = (tag_cfg.get('selection_criteria') or '').strip()

    allowed = "\n".join(f"- {t}" for t in wl_list)
    criteria_block = (
        f"SELECTION CRITERIA:\n{selection_criteria}\n\n"
        if selection_criteria else ""
    )

    mlx_cfg = settings.get('enhancement.mlx') or {}
    model_path = (mlx_cfg.get('model_path') or '').strip()
    if not model_path:
        raise ValueError("MLX model not selected. Set one in Settings > Enhancement.")
    temperature = float(mlx_cfg.get('temperature', 0.6))
    timeout = int(mlx_cfg.get('timeout_seconds', 40))

    # ── Helper: parse a list of tags from LLM output ──
    item_rx = _re.compile(r"^\s*(?:[-*]\s+|(?:\d+[.)]\s+))?#?\s*([A-Za-z][A-Za-z0-9_\-/]*)\s*$")

    def parse_tags(raw_text: str) -> list[str]:
        seen = set()
        out = []
        for line in raw_text.replace('\r', '\n').split('\n'):
            m = item_rx.match(line)
            if m:
                t = m.group(1).strip()
                tl = t.lower()
                if tl and tl not in seen:
                    seen.add(tl)
                    out.append(t)
        return out

    # ── PASS 1: Select from whitelist ──
    prompt_select = (
        "You are selecting tags for a personal knowledge note.\n"
        "Your ONLY job: pick the most relevant tags from the WHITELIST below.\n\n"
        "TEXT:\n" + text + "\n\n"
        + criteria_block
        + "WHITELIST:\n" + allowed + "\n\n"
        f"Select up to {max_old} tags from the WHITELIST that are relevant to the TEXT.\n"
        "Copy them EXACTLY as written. Do NOT invent new tags.\n"
        "If fewer are relevant, that is fine.\n\n"
        "Output ONLY a list, one tag per line, prefixed with a dash:\n"
        "- tag1\n- tag2\n"
    )

    logger.info(f"Pass 1: Selecting from {len(wl_list)} whitelist tags for {file_id}")
    try:
        raw_select = (generate_with_mlx(
            prompt=prompt_select, input_text="",
            model_path=model_path, max_tokens=200,
            temperature=temperature, timeout_seconds=timeout
        ) or '').strip()
    except Exception as e:
        raise ValueError(f"Tag selection failed: {e}")

    old_parsed = parse_tags(raw_select)
    old_final = []
    old_rejected = []
    for t in old_parsed:
        tl = t.lower()
        if tl in wl:
            old_final.append(wl[tl])
        else:
            old_rejected.append(t)
    if old_rejected:
        logger.info(f"Pass 1 rejected (not in whitelist): {old_rejected}")
    if len(old_final) > max_old:
        old_final = old_final[:max_old]
    logger.info(f"Pass 1 result: {len(old_final)} whitelist matches from {len(old_parsed)} parsed")

    # ── PASS 2: Invent new tags ──
    selected_str = ", ".join(old_final) if old_final else "(none)"
    prompt_new = (
        "You are inventing new tags for a personal knowledge note.\n"
        "Tags already assigned: " + selected_str + "\n\n"
        "TEXT:\n" + text + "\n\n"
        f"Propose up to {max_new} NEW tags that would help categorise this text.\n"
        "Tags must be lowercase, single-word or hyphenated (e.g. car-leasing).\n"
        "Do NOT repeat any of the already-assigned tags.\n\n"
        "Output ONLY a list, one tag per line, prefixed with a dash:\n"
        "- newtag1\n- newtag2\n"
    )

    logger.info(f"Pass 2: Generating new tags for {file_id}")
    try:
        raw_new = (generate_with_mlx(
            prompt=prompt_new, input_text="",
            model_path=model_path, max_tokens=150,
            temperature=temperature, timeout_seconds=timeout
        ) or '').strip()
    except Exception as e:
        logger.warning(f"New tag generation failed: {e}")
        raw_new = ""

    new_parsed = parse_tags(raw_new)
    # Filter out any that are already in whitelist or in selected
    selected_lower = {t.lower() for t in old_final}
    new_final = [t for t in new_parsed if t.lower() not in wl and t.lower() not in selected_lower]
    if len(new_final) > max_new:
        new_final = new_final[:max_new]
    logger.info(f"Pass 2 result: {len(new_final)} new suggestions from {len(new_parsed)} parsed")

    raw = f"--- PASS 1 (select) ---\n{raw_select}\n\n--- PASS 2 (invent) ---\n{raw_new}"

    pf.tag_suggestions = {'old': old_final, 'new': new_final}
    status_tracker.save_file_status(file_id)

    return {
        'success': True,
        'old': old_final,
        'new': new_final,
        'raw': raw,
        'whitelist_count': len(wl_list),
        'used_max_old': max_old,
        'used_max_new': max_new,
    }
