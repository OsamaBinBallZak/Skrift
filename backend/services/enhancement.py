"""
Enhancement service
Handles AI enhancement with MLX models and streaming
"""

import time
import asyncio
import threading
import re
import logging
from config.settings import settings
from services.mlx_runner import generate_with_mlx, stream_with_mlx, plan_generation, MLXNotAvailable
from utils.status_tracker import status_tracker

logger = logging.getLogger(__name__)

# Track active streams to prevent concurrent encodes per file
ACTIVE_ENHANCE_STREAMS: set[str] = set()


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
        logger.warning(f"Failed to auto-clear MLX cache: {e}")


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


async def generate_enhancement_stream(file_id: str, input_text: str, prompt: str):
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

        # Try true streaming first
        try:
            print("[SSE] Enhance stream: attempting true MLX streaming")
            acc = []  # collector fed by model thread
            sse_chunks = []  # authoritative stream buffer of what we actually emitted
            
            async def stream_tokens():
                # stream_with_mlx is a regular generator; iterate in thread to avoid blocking loop
                loop_acc = {"error": None}
                
                def run_and_collect():
                    try:
                        print(f"[MLX] Starting stream_with_mlx for file {file_id}")
                        for piece in stream_with_mlx(
                            prompt=prompt or "You are an assistant that enhances transcripts.",
                            input_text=input_text,
                            model_path=model_path,
                            max_tokens=int(mlx_cfg.get('max_tokens', 512)),
                            temperature=float(mlx_cfg.get('temperature', 0.7)),
                        ):
                            acc.append(piece)
                        print(f"[MLX] Stream completed for file {file_id}, got {len(acc)} pieces")
                    except Exception as e:
                        print(f"[MLX ERROR] Stream failed: {e}")
                        import traceback
                        traceback.print_exc()
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
            final = ''.join(sse_chunks) if sse_chunks else ''.join(acc)
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
