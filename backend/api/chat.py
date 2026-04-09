"""
Chat API — ask the AI questions about a note's content.
Streams responses via SSE, reusing the same MLX model as enhancement.
"""

import asyncio
import threading
import logging
import json as _json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from utils.status_tracker import status_tracker
from config.settings import settings
from services.mlx_runner import stream_with_mlx, plan_generation

logger = logging.getLogger(__name__)

router = APIRouter()

# Concurrency guard — one chat stream per file at a time
ACTIVE_CHAT_STREAMS: set[str] = set()

CHAT_SYSTEM_PROMPT = (
    "You are a helpful assistant. The user is asking a question about their note. "
    "Answer based on the note content provided. Be concise and direct. "
    "If the note is in a mix of languages, respond in the primary language of the note."
)


def _sse(event: str, data: str) -> str:
    """Format an SSE event with proper multi-line data framing."""
    lines = (data or "").splitlines()
    buf = [f"event: {event}\n"]
    if not lines:
        buf.append("data: \n")
    else:
        for ln in lines:
            buf.append(f"data: {ln}\n")
    buf.append("\n")
    return ''.join(buf)


def _get_best_text(pf) -> str:
    """Return the best available text for context: enhanced > sanitised > transcript."""
    return pf.enhanced_copyedit or pf.sanitised or pf.transcript or ""


async def generate_chat_stream(file_id: str, message: str):
    """SSE generator for chat. Yields start, token*, done, or error events."""
    if file_id in ACTIVE_CHAT_STREAMS:
        raise RuntimeError("Chat stream already in progress for this file")
    ACTIVE_CHAT_STREAMS.add(file_id)

    try:
        yield _sse("start", "")

        # Resolve model
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

        # Validate model is under deps folder
        try:
            models_root = get_mlx_models_path()
            p = Path(model_path).resolve()
            root = models_root.resolve()
            if root not in p.parents and p != root:
                yield _sse("error", "Selected MLX model is outside the current dependencies folder.")
                return
        except Exception:
            pass

        # Get note content
        pf = status_tracker.get_file(file_id)
        if not pf:
            yield _sse("error", "File not found")
            return
        note_text = _get_best_text(pf)
        if not note_text:
            yield _sse("error", "No text content available. Transcribe or import a note first.")
            return

        # Build the user message with note context
        user_message = f"Note content:\n{note_text}\n\nQuestion: {message}"

        # Stream tokens
        acc = []
        sse_chunks = []

        async def stream_tokens():
            loop_acc = {"error": None}

            def run_and_collect():
                try:
                    for piece in stream_with_mlx(
                        prompt=CHAT_SYSTEM_PROMPT,
                        input_text=user_message,
                        model_path=model_path,
                        max_tokens=int(mlx_cfg.get('max_tokens', 512)),
                        temperature=float(mlx_cfg.get('temperature', 0.7)),
                    ):
                        acc.append(piece)
                except Exception as e:
                    logger.error(f"Chat stream failed for {file_id}: {e}", exc_info=True)
                    loop_acc["error"] = str(e)

            th = threading.Thread(target=run_and_collect, daemon=True)
            th.start()

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

        final = ''.join(sse_chunks) if sse_chunks else ''.join(acc)
        yield _sse("done", final)

        # Schedule idle cache clear (same as enhancement)
        from services.enhancement import _schedule_idle_cache_clear
        asyncio.create_task(_schedule_idle_cache_clear())

    except Exception as e:
        yield _sse("error", str(e))

    finally:
        ACTIVE_CHAT_STREAMS.discard(file_id)


@router.get("/stream/{file_id}")
async def chat_stream(file_id: str, message: str = ""):
    """Stream a chat response about the note via SSE."""
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    if not message.strip():
        raise HTTPException(status_code=400, detail="No message provided")

    if file_id in ACTIVE_CHAT_STREAMS:
        raise HTTPException(status_code=409, detail="Chat stream already in progress for this file")

    return StreamingResponse(
        generate_chat_stream(file_id, message.strip()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
