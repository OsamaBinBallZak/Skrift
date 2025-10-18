"""
Local MLX runner wrapper.
Uses mlx-lm to generate text from a prompt + input. If mlx is not installed or model is missing,
raises a clear error so the API can fall back gracefully.

This module takes special care to only pass sampling kwargs that the installed
mlx-lm version supports (e.g., some builds don't accept temperature/temp/stop),
so your configured parameters actually take effect without breaking older APIs.
"""
from __future__ import annotations

import time
import inspect
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

class MLXNotAvailable(Exception):
    pass


def _filter_generate_kwargs(generate_func, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filter/translate kwargs so we only pass args that the current mlx_lm.generate
    actually supports, handling temperature vs temp and optional params like stop/stream.

    Important: Many mlx_lm.generate versions accept arbitrary **kwargs and forward
    them internally. If the signature includes a VAR_KEYWORD (e.g., **kwargs), we
    should not drop keys by name filtering; instead, pass through after aliasing.
    """
    try:
        sig = inspect.signature(generate_func)
        params_map = sig.parameters
        has_var_kw = any(p.kind == inspect._ParameterKind.VAR_KEYWORD for p in params_map.values())
        params = set(params_map.keys())
    except Exception:
        # If introspection fails, keep a minimal safe subset
        has_var_kw = True
        params = {"max_tokens", "verbose", "stream"}

    out = dict(kwargs)

    # Handle temperature aliasing
    if "temperature" in out and "temperature" not in params:
        if "temp" in params:
            out["temp"] = out.pop("temperature")
        else:
            # If generate accepts **kwargs, allow temperature to pass through; otherwise drop
            if not has_var_kw:
                out.pop("temperature", None)

    # Proactively drop commonly unsupported knobs unless explicitly in signature
    for k in ("temperature", "temp", "stop", "stream"):
        if k in out and k not in params:
            out.pop(k, None)

    # If generate accepts **kwargs, allow passthrough of remaining keys (after aliasing)
    if has_var_kw:
        return out

    # Otherwise, drop unknown keys strictly
    out = {k: v for k, v in out.items() if k in params}

    return out


def _load_tokenizer(model_path: Path):
    try:
        from transformers import AutoTokenizer
    except Exception:
        return None, None
    # Attempt loading tokenizer from the model directory
    try:
        tok = AutoTokenizer.from_pretrained(str(model_path), trust_remote_code=True)
        tmpl = getattr(tok, 'chat_template', None)
        return tok, tmpl
    except Exception:
        # Some MLX model dirs may not include tokenizer files
        return None, None


def _build_prompt(prompt: str, input_text: str, model_path: Path) -> Tuple[str, bool, Optional[str], Optional[object]]:
    """
    Build the final prompt. If a chat template is available and enabled in settings,
    render messages via apply_chat_template. Returns: (final_prompt, used_chat, template_name, tokenizer)
    """
    from config.settings import settings as app_settings

    cfg = app_settings.get('enhancement.mlx') or {}
    use_chat = bool(cfg.get('use_chat_template', True))

    # Try to load tokenizer and its chat template
    tok, tmpl = _load_tokenizer(model_path) if use_chat else (None, None)

    if use_chat and tok is not None and getattr(tok, 'chat_template', None):
        try:
            messages = [
                {"role": "system", "content": prompt.strip()},
                {"role": "user", "content": f"Transcript:\n{input_text}"},
            ]
            final_prompt = tok.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True
            )
            template_name = getattr(tok, 'chat_template', None)
            return final_prompt, True, ("present" if template_name else None), tok
        except Exception:
            pass

    # Fallback to plain prompt
    basic = f"{prompt.strip()}\n\nTranscript:\n{input_text}\n\nOutput:"
    return basic.strip(), False, None, tok


def _effective_max_tokens(input_text: str, provided_cap: int, tokenizer_obj: Optional[object]) -> int:
    from config.settings import settings as app_settings

    cfg = app_settings.get('enhancement.mlx') or {}
    dynamic = bool(cfg.get('dynamic_tokens', True))
    ratio = float(cfg.get('dynamic_ratio', 1.2))
    min_tokens = int(cfg.get('min_tokens', 256))

    if not dynamic:
        return int(provided_cap)

    # Token count via tokenizer if available
    input_tokens = None
    try:
        if tokenizer_obj is not None:
            input_tokens = len(tokenizer_obj.encode(input_text))
    except Exception:
        input_tokens = None

    if input_tokens is None:
        # Fallback rough estimate: ~4 chars per token
        input_tokens = max(1, len(input_text) // 4)

    target = int(max(min_tokens, input_tokens * ratio))
    return int(min(provided_cap, target))


def stream_with_mlx(prompt: str, input_text: str, model_path: str, max_tokens: int = 512, temperature: float = 0.7):
    """
    Yield tokens/chunks incrementally using mlx-lm streaming if available.
    This function is best-effort: it attempts to use stream=True. If the
    installed mlx_lm does not support streaming, it raises MLXNotAvailable.
    """
    if not model_path:
        raise MLXNotAvailable("MLX model_path is not configured.")
    p = Path(model_path)
    if not p.exists():
        raise MLXNotAvailable(f"MLX model not found at: {model_path}")

    try:
        import mlx
        from mlx_lm import load, stream_generate
    except Exception as e:
        raise MLXNotAvailable(f"MLX runtime not available: {e}")

    model, tokenizer = load(str(p))

    # Prepare prompt using chat template if available
    final_prompt, used_chat, tmpl_name, hf_tok = _build_prompt(prompt, input_text, p)

    # Compute effective max tokens (dynamic budget if enabled)
    eff_max = _effective_max_tokens(input_text, max_tokens, hf_tok)

    # Use the official streaming iterator which yields incremental pieces (r.text)
    try:
        for r in stream_generate(model, tokenizer, final_prompt, max_tokens=eff_max):
            # r may be an object with .text or a dict-like with 'text'
            piece = getattr(r, 'text', None)
            if piece is None and isinstance(r, dict):
                piece = r.get('text')
            if piece:
                yield piece
    except TypeError as e:
        # Older versions lacking stream_generate
        raise MLXNotAvailable(f"stream_generate not supported by this mlx_lm version: {e}")


def generate_with_mlx(prompt: str, input_text: str, model_path: str, max_tokens: int = 512, temperature: float = 0.7, timeout_seconds: int = 45) -> str:
    """
    Generate text using Apple's MLX via mlx-lm.
    This function expects mlx and mlx_lm to be installed in the backend environment.

    Notes on sampling params compatibility:
    - Some mlx-lm versions ignore or error on 'temperature'/'temp' kwargs due to internal API drift.
    - We introspect the installed API and only pass supported kwargs so your settings are honored.
    """
    start = time.time()

    if not model_path:
        raise MLXNotAvailable("MLX model_path is not configured.")

    p = Path(model_path)
    if not p.exists():
        raise MLXNotAvailable(f"MLX model not found at: {model_path}")

    try:
        # Lazy imports so environments without MLX can still run the server
        import mlx
        from mlx_lm import load, generate
    except Exception as e:
        raise MLXNotAvailable(f"MLX runtime not available: {e}")

    # Load the model
    model, tokenizer = load(str(p))

    # Prepare prompt using chat template if available
    final_prompt, used_chat, tmpl_name, hf_tok = _build_prompt(prompt, input_text, p)

    # Compute effective max tokens (dynamic budget if enabled)
    eff_max = _effective_max_tokens(input_text, max_tokens, hf_tok)

    # Generate with timeout guard (simple check loop)
    # mlx_lm.generate does not have built-in timeout, so rely on short generation and external cap
    try:
        base_kwargs = {
            "max_tokens": eff_max,
            "temperature": float(temperature),
            "verbose": False,
            # Force no default stop sequences from mlx-lm to avoid premature termination
            "stop": None,
        }
        gen_kwargs = _filter_generate_kwargs(generate, base_kwargs)

        output_text = generate(
            model,
            tokenizer,
            prompt=final_prompt,
            **gen_kwargs,
        )
    except Exception as e:
        raise RuntimeError(f"MLX generation failed: {e}")

    if time.time() - start > timeout_seconds:
        raise TimeoutError("MLX generation exceeded timeout")

    return (output_text or "").strip()


def plan_generation(prompt: str, input_text: str, model_path: str, max_tokens: int = 512, temperature: float = 0.7) -> Dict[str, Any]:
    """
    Prepare generation plan for debugging: returns prompt type, effective tokens, and whether chat template is used.
    """
    if not model_path:
        raise MLXNotAvailable("MLX model_path is not configured.")
    p = Path(model_path)
    if not p.exists():
        raise MLXNotAvailable(f"MLX model not found at: {model_path}")

    final_prompt, used_chat, tmpl_name, hf_tok = _build_prompt(prompt, input_text, p)
    eff_max = _effective_max_tokens(input_text, max_tokens, hf_tok)

    return {
        "used_chat_template": used_chat,
        "template_available": bool(tmpl_name),
        "effective_max_tokens": eff_max,
        "prompt_preview": final_prompt[:240]
    }
