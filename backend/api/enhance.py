"""
Enhancement API Router
Handles all enhancement-related endpoints including:
- Model testing and streaming enhancement
- Tag whitelist management and tag generation
- Copy edit, summary, tags field updates
- Compilation to Obsidian-ready markdown
- MLX model management (list, upload, delete, select)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pathlib import Path
import subprocess
import json as _json
import os
import re as _re

from utils.status_tracker import status_tracker, ProcessingStatus
from services.enhancement import (
    test_model,
    generate_enhancement,
    generate_enhancement_stream,
    MLXNotAvailable,
)
from config.settings import get_file_output_folder, settings as app_settings
from models import ProcessingRequest, ProcessingResponse

router = APIRouter()

# =========================
# Enhancement Core APIs
# =========================

@router.post("/test")
async def test_enhance_model():
    """
    Quick test to validate the currently selected MLX model loads and can generate text.
    Returns a short sample output and timing along with the selected model path.
    """
    try:
        return test_model()
    except MLXNotAvailable as e:
        raise HTTPException(status_code=500, detail=f"MLX not available: {e}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test generation failed: {e}")

@router.post("/{file_id}", response_model=ProcessingResponse)
async def start_enhancement(file_id: str, request: ProcessingRequest = ProcessingRequest()):
    """
    Start AI enhancement for a file (local MLX planned; MVP uses deterministic text transform)
    - Requires sanitisation to be completed first
    - Enhances the sanitised text and saves to status.json
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if sanitisation is done
    if pipeline_file.steps.sanitise != ProcessingStatus.DONE:
        raise HTTPException(status_code=400, detail="Sanitisation must be completed before enhancement")
    
    # Determine source text
    text = pipeline_file.sanitised or pipeline_file.transcript or ""
    if not text:
        raise HTTPException(status_code=400, detail="No input text available to enhance")
    
    # Mark processing
    status_tracker.update_file_status(file_id, "enhance", ProcessingStatus.PROCESSING)
    
    try:
        preset = (request.enhancementType or "polish").lower()
        prompt_text = (request.prompt or "").strip()

        # Call service layer
        result = generate_enhancement(file_id, text, prompt_text, preset)
        
        if result['status'] == 'error':
            status_tracker.update_file_status(file_id, "enhance", ProcessingStatus.ERROR, error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        # Update status with result
        status_tracker.add_processing_time(file_id, "enhance", result['processing_time'])
        status_tracker.update_file_status(
            file_id,
            "enhance",
            ProcessingStatus.DONE,
            result_content=result['enhanced']
        )

        return ProcessingResponse(
            status="done",
            message=f"Enhancement ({preset}) completed",
            file=status_tracker.get_file(file_id)
        )
    except HTTPException:
        raise
    except Exception as e:
        status_tracker.update_file_status(
            file_id,
            "enhance",
            ProcessingStatus.ERROR,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Failed to enhance: {str(e)}")


@router.get("/input/{file_id}")
async def get_enhance_input(file_id: str):
    """Return exactly the text that would be sent to the LLM for enhancement.
    This mirrors the source selection logic used by enhance_stream.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    source = 'sanitised' if (pipeline_file.sanitised or '') else 'transcript'
    input_text = pipeline_file.sanitised or pipeline_file.transcript or ""
    return { 'source': source, 'length': len(input_text), 'input_text': input_text }

@router.get("/stream/{file_id}")
async def enhance_stream(file_id: str, prompt: str = ""):
    """
    Stream enhancement output via SSE for a given file_id.
    MVP: run MLX generation in a background thread, send heartbeat tokens during work,
    then stream the final text in chunks to simulate real-time output, and persist result.
    Rejects with 409 if a stream is already active for the same file.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")

    input_text = pipeline_file.sanitised or pipeline_file.transcript or ""
    if not input_text:
        raise HTTPException(status_code=400, detail="No text available to enhance. Run sanitise or transcribe first.")

    try:
        return StreamingResponse(
            generate_enhancement_stream(file_id, input_text, prompt),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except RuntimeError as e:
        # Concurrency error
        raise HTTPException(status_code=409, detail=str(e))

# =========================
# Enhancement Fields APIs
# =========================

@router.get("/plan/{file_id}")
async def get_enhance_plan(file_id: str):
    """
    Return the exact final prompt that will be sent to the model for copy edit, along with stats.
    This is for debugging and contains the full assembled prompt string.
    """
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    input_text = pf.sanitised or pf.transcript or ""
    if not input_text:
        raise HTTPException(status_code=400, detail="No text available")
    # Determine prompt: use persisted copy_edit prompt; fallback to default
    enh_cfg = app_settings.get('enhancement') or {}
    prompts = (enh_cfg.get('prompts') or {})
    copy_prompt = prompts.get('copy_edit') or "You are an assistant that enhances transcripts."
    mlx_cfg = enh_cfg.get('mlx') or {}
    model_path = (mlx_cfg.get('model_path') or '').strip()
    if not model_path:
        raise HTTPException(status_code=400, detail="MLX model not selected")
    from services.mlx_runner import _build_prompt, _effective_max_tokens
    final_prompt, used_chat, tmpl_name, hf_tok = _build_prompt(copy_prompt, input_text, Path(model_path))
    eff_max = _effective_max_tokens(input_text, int(mlx_cfg.get('max_tokens', 512)), hf_tok)
    return {
        'used_chat_template': used_chat,
        'effective_max_tokens': eff_max,
        'input_length': len(input_text),
        'prompt_length': len(final_prompt),
        'final_prompt': final_prompt
    }

@router.post("/copyedit/{file_id}")
async def set_enhance_copyedit(file_id: str, body: dict):
    text = str(body.get('text') or '')
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'text'")
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    status_tracker.set_enhancement_fields(file_id, copyedit=text)
    return { 'success': True, 'file': status_tracker.get_file(file_id) }

# Backward-compatible route
@router.post("/working/{file_id}")
async def set_enhance_working_compat(file_id: str, body: dict):
    return await set_enhance_copyedit(file_id, body)

@router.post("/summary/{file_id}")
async def set_enhance_summary(file_id: str, body: dict):
    summary = str(body.get('summary') or '')
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    status_tracker.set_enhancement_fields(file_id, summary=summary)
    return { 'success': True, 'file': status_tracker.get_file(file_id) }

@router.post("/tags/{file_id}")
async def set_enhance_tags(file_id: str, body: dict):
    tags = body.get('tags') or []
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="'tags' must be a list")
    tags = [str(t).strip() for t in tags if str(t).strip()]
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    status_tracker.set_enhancement_fields(file_id, tags=tags)
    return { 'success': True, 'tags': tags, 'file': status_tracker.get_file(file_id) }

# =========================
# Tag Management APIs
# =========================

@router.get("/tags/whitelist")
async def get_tag_whitelist():
    """
    Return the cached tag whitelist. Does not scan the vault.
    """
    cfg = app_settings.get('enhancement.obsidian') or {}
    wl_path = (Path(cfg.get('tags_whitelist_path') or '')).expanduser()
    try:
        if wl_path and wl_path.exists():
            return _json.loads(wl_path.read_text(encoding='utf-8', errors='ignore'))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read whitelist: {e}")
    return { 'version': 1, 'count': 0, 'tags': [] }

@router.post("/tags/whitelist/refresh")
async def refresh_tag_whitelist():
    """
    Scan the configured Obsidian vault (read-only) and rebuild the tag whitelist.
    - Reads tags from YAML frontmatter (tags: [...]) and inline #tags.
    - Excludes numeric-only and code-block tags; requires a letter.
    - Writes to enhancement.obsidian.tags_whitelist_path.
    """
    cfg = app_settings.get('enhancement.obsidian') or {}
    vault = (Path(cfg.get('vault_path') or '')).expanduser()
    wl_path = (Path(cfg.get('tags_whitelist_path') or '')).expanduser()

    if not str(vault):
        raise HTTPException(status_code=400, detail="Obsidian vault path not configured")
    if not vault.exists() or not vault.is_dir():
        raise HTTPException(status_code=400, detail="Obsidian vault path not found or not a directory")

    # Frontmatter only at file start; we only extract tags from YAML frontmatter, never inline #tags
    fm_start_rx = _re.compile(r"^---\n([\s\S]*?)\n---\n?", _re.MULTILINE)
    tags_key_rx = _re.compile(r"^tags:\s*(.+)$", _re.MULTILINE)
    yaml_list_rx = _re.compile(r"\[(.*?)\]")
    dash_item_rx = _re.compile(r"^-\s*([A-Za-z][A-Za-z0-9/_-]*)$", _re.MULTILINE)
    numeric_only_rx = _re.compile(r"^\d+$")

    tags = set()
    scanned = 0
    for p in vault.rglob('*.md'):
        # skip Obsidian internals
        if any(part.startswith('.obsidian') for part in p.parts):
            continue
        scanned += 1
        try:
            txt = p.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        # Frontmatter block only if at file start
        mfm = fm_start_rx.search(txt)
        if not mfm:
            continue
        block = mfm.group(1)
        # tags: line (list or scalar)
        for m in tags_key_rx.finditer(block):
            val = m.group(1).strip()
            mlist = yaml_list_rx.search(val)
            if mlist:
                for item in mlist.group(1).split(','):
                    t = item.strip().strip('"\'')
                    t = t.lstrip('-').lstrip('#').strip().lower()
                    if t and not numeric_only_rx.match(t):
                        tags.add(t)
            else:
                # Scalar form: tags: project
                t = val.strip().strip('"\'')
                t = t.lstrip('-').lstrip('#').strip().lower()
                if t and not numeric_only_rx.match(t):
                    tags.add(t)
        # dash items directly under tags: key
        if 'tags:' in block:
            # capture only contiguous dash lines after a 'tags:' line
            lines = block.splitlines()
            for i, line in enumerate(lines):
                if line.strip().startswith('tags:'):
                    j = i + 1
                    while j < len(lines) and lines[j].lstrip().startswith('-'):
                        m = _re.match(r"^\s*-\s*([A-Za-z][A-Za-z0-9/_-]*)\s*$", lines[j])
                        if m:
                            t = m.group(1).strip().lower()
                            if t and not numeric_only_rx.match(t):
                                tags.add(t)
                        j += 1
                    break

    data = { 'version': 1, 'count': len(tags), 'tags': sorted(tags) }
    try:
        wl_path.parent.mkdir(parents=True, exist_ok=True)
        wl_path.write_text(_json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write whitelist: {e}")

    return { 'success': True, 'count': len(tags), 'path': str(wl_path), 'scanned_files': scanned }

@router.post("/tags/generate/{file_id}")
async def generate_tags(file_id: str, body: dict = None):
    """
    Generate tag suggestions using MLX with explicit two-section output:
    - OLD_TAGS: exactly 10 tags drawn from the whitelist that fit the sanitised text
    - NEW_TAGS: up to 5 tags NOT present in the whitelist but recommended
    Returns suggestions only (does not persist). The client will let the user pick and then POST the chosen set.
    """
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    # Source must be the sanitised transcript (per product decision)
    text = pf.sanitised or ''
    if not text:
        # Fallback to transcript if sanitised missing, but prefer sanitised
        text = pf.transcript or ''
    if not text:
        raise HTTPException(status_code=400, detail="No text available for tagging (need sanitised or transcript)")

    # Load full whitelist (no truncation) and prepare normalization
    wl_resp = await get_tag_whitelist()
    wl_list = [str(t).strip() for t in wl_resp.get('tags', []) if str(t).strip()]
    wl = { t.lower(): t for t in wl_list }  # map lower->original for pretty echo if needed
    if not wl:
        raise HTTPException(status_code=400, detail="Whitelist is empty; refresh it in settings")

    # Read configurable counts
    tag_cfg = app_settings.get('enhancement.tags') or {}
    max_old = int(tag_cfg.get('max_old', 10))
    max_new = int(tag_cfg.get('max_new', 5))
    print(f"[tags.generate] using max_old={max_old} max_new={max_new}")

    # Build strict-format prompt
    # We include the entire whitelist and the sanitised text, with explicit output format instructions
    allowed = "\n".join(f"- {t}" for t in wl_list)
    prompt = (
        "You are selecting tags for a personal knowledge note.\n"
        "Use ONLY the provided information. Analyze the TEXT and propose tags.\n\n"
        "TEXT:\n" + text + "\n\n"
        "WHITELIST:\n" + allowed + "\n\n"
        "TASK:\n"
        f"1) Choose EXACTLY {max_old} tags from the WHITELIST that best fit the TEXT.\n"
        f"2) Propose EXACTLY {max_new} additional tags that are NOT in the WHITELIST but would be useful.\n\n"
        "OUTPUT FORMAT (strict, no prose outside these lines):\n"
        "OLD_TAGS:\n"
        + "\n".join(f"- tag_{i}" for i in range(1, max_old+1)) + "\n"
        "NEW_TAGS:\n"
        + "\n".join(f"- new_tag_{i}" for i in range(1, max_new+1)) + "\n"
    )

    # Run model
    try:
        from services.mlx_runner import generate_with_mlx
        mlx_cfg = app_settings.get('enhancement.mlx') or {}
        model_path = (mlx_cfg.get('model_path') or '').strip()
        if not model_path:
            raise HTTPException(status_code=400, detail="MLX model not selected. Set one in Settings > Enhancement.")
        out = generate_with_mlx(
            prompt=prompt,
            input_text="",  # prompt contains everything
            model_path=model_path,
            max_tokens=256,
            temperature=float(mlx_cfg.get('temperature', 0.6)),
            timeout_seconds=int(mlx_cfg.get('timeout_seconds', 40))
        )
        raw = (out or '').strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tag generation failed: {e}")

    # Parse strict format
    # Expect two sections starting with headers OLD_TAGS: and NEW_TAGS:, each with dash-prefixed lines
    old, new = [], []
    try:
        # Normalize line endings
        s = raw.replace('\r\n', '\n').replace('\r', '\n')
        # Split into sections by headers
        old_match = _re.search(r"OLD_TAGS:\n([\s\S]*?)(?:\n\s*NEW_TAGS:|\Z)", s, flags=_re.IGNORECASE)
        new_match = _re.search(r"NEW_TAGS:\n([\s\S]*)\Z", s, flags=_re.IGNORECASE)
        dash_rx = _re.compile(r"^\s*-\s*([A-Za-z0-9_\-/]+)\s*$")
        if old_match:
            for line in old_match.group(1).split('\n'):
                m = dash_rx.match(line)
                if m:
                    old.append(m.group(1).strip())
        if new_match:
            for line in new_match.group(1).split('\n'):
                m = dash_rx.match(line)
                if m:
                    new.append(m.group(1).strip())
    except Exception:
        # Fallback: empty lists if parsing fails
        old, new = [], []

    # Post-process: normalize, enforce counts, filter old to whitelist, filter new to NOT whitelist
    def norm_unique(lst):
        seen = set(); out = []
        for t in lst:
            tl = t.lower()
            if tl and tl not in seen:
                seen.add(tl); out.append(t)
        return out
    old = norm_unique(old)
    new = norm_unique(new)

    # Map old to whitelist casing and filter
    old_final = []
    for t in old:
        tl = t.lower()
        if tl in wl:
            old_final.append(wl[tl])
    # Truncate/pad to exactly max_old old tags (pad by best-effort whitelist scan if model returned fewer)
    if len(old_final) > max_old:
        old_final = old_final[:max_old]
    elif len(old_final) < max_old:
        # fill with other whitelist entries heuristically present in text
        import re as _re2
        text_l = text.lower()
        for cand_l, orig in wl.items():
            if len(old_final) >= max_old: break
            if orig in old_final: continue
            # simple heuristic: word boundary presence
            try:
                if _re2.search(rf"\b{_re2.escape(cand_l)}\b", text_l):
                    old_final.append(orig)
            except Exception:
                continue

    # New tags must NOT be in whitelist
    new_final = [t for t in new if t.lower() not in wl]
    if len(new_final) > max_new:
        new_final = new_final[:max_new]

    return { 'success': True, 'old': old_final, 'new': new_final, 'raw': raw, 'whitelist_count': len(wl_list), 'used_max_old': max_old, 'used_max_new': max_new }

# =========================
# Compilation API
# =========================

@router.post("/compile/{file_id}")
async def compile_for_obsidian(file_id: str):
    """
    Compile a final Obsidian-ready markdown file (code only, no LLM):
    - YAML frontmatter using template fields
    - date from audio creation (ffprobe) or file timestamps as fallback
    - tags from enhanced_tags (list)
    - summary from enhanced_summary
    - body from enhanced_working (fallback to sanitised/transcript)
    """
    pf = status_tracker.get_file(file_id)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    # Determine date
    date_str = None
    try:
        cmd = [
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format",
            pf.path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
        if res.returncode == 0:
            info = _json.loads(res.stdout or '{}')
            tags = (info.get('format') or {}).get('tags') or {}
            ctime = tags.get('creation_time') or tags.get('com.apple.quicktime.creationdate')
            if ctime:
                date_str = ctime[:10]  # YYYY-MM-DD
    except Exception:
        pass
    try:
        if not date_str:
            st = os.stat(pf.path)
            # macOS provides st_birthtime; fallback to mtime
            import datetime as _dt
            dt = _dt.datetime.fromtimestamp(getattr(st, 'st_birthtime', st.st_mtime))
            date_str = dt.strftime('%Y-%m-%d')
    except Exception:
        date_str = None

    folder = get_file_output_folder(pf.filename)

    working = pf.enhanced_copyedit or pf.sanitised or pf.transcript or ''
    summary = pf.enhanced_summary or ''
    tags = pf.enhanced_tags or []


    # YAML frontmatter as requested
    yaml_lines = [
        '---',
        f'title: {pf.filename.rsplit(".", 1)[0]}',
        f'date: {date_str or ""}',
        'lastTouched:',
        'firstMentioned:',
        'author: Tiuri',
        'source: Voice-memo',
        'location:',
        'tags:'
    ]
    for t in tags:
        yaml_lines.append(f'  - {t}')
    yaml_lines.extend([
        'confidence:',
        'summary:',
        '---',
        ''
    ])
    # Put summary content directly on the YAML 'summary:' line if available
    if summary:
        yaml_lines[ yaml_lines.index('summary:') ] = f"summary: {summary}"
    content = '\n'.join(yaml_lines) + working

    out_path = folder / 'compiled.md'
    try:
        out_path.write_text(content, encoding='utf-8')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write compiled note: {e}")

    # If all three enhancement parts exist, mark enhance as DONE so UI goes green
    try:
        if (pf.enhanced_copyedit or '') and (pf.enhanced_summary or '') and ((pf.enhanced_tags or [])):
            status_tracker.update_file_status(file_id, 'enhance', ProcessingStatus.DONE)
    except Exception:
        pass

    # NOTE: Do NOT mark export as done here - that should only happen when user clicks Export in the Export tab
    return { 'success': True, 'compiled_path': str(out_path) }

# =========================
# MLX Model Management APIs
# =========================

@router.get("/models")
async def list_enhance_models():
    cfg = app_settings.get('enhancement.mlx') or {}
    models_dir = Path(cfg.get('models_dir'))
    models_dir.mkdir(parents=True, exist_ok=True)
    selected = cfg.get('model_path')
    items = []

    def dir_size(path: Path) -> int:
        total = 0
        for root, dirs, files in os.walk(path):
            for f in files:
                try:
                    total += (Path(root) / f).stat().st_size
                except Exception:
                    pass
        return total

    for p in models_dir.iterdir():
        try:
            if p.is_file():
                size = p.stat().st_size
            elif p.is_dir():
                size = dir_size(p)
            else:
                continue
        except Exception:
            size = None
        items.append({
            'name': p.name,
            'path': str(p),
            'size': size,
            'selected': str(p) == str(selected) if selected else False
        })
    return { 'models': items, 'selected': selected }

@router.post("/models/upload")
async def upload_enhance_model(file: UploadFile = File(...)):
    import shutil
    cfg = app_settings.get('enhancement.mlx') or {}
    models_dir = Path(cfg.get('models_dir'))
    models_dir.mkdir(parents=True, exist_ok=True)
    dest = models_dir / file.filename
    try:
        with dest.open('wb') as out:
            shutil.copyfileobj(file.file, out)
    finally:
        await file.close()
    return { 'success': True, 'path': str(dest), 'name': file.filename }

@router.delete("/models/{filename}")
async def delete_enhance_model(filename: str):
    cfg = app_settings.get('enhancement.mlx') or {}
    models_dir = Path(cfg.get('models_dir'))
    target = models_dir / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="Model file not found")
    # If currently selected, clear selection
    if cfg.get('model_path') and str(target) == str(cfg.get('model_path')):
        app_settings.set('enhancement.mlx.model_path', None)
    try:
        target.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {e}")
    return { 'success': True }

@router.post("/models/select")
async def select_enhance_model(path: str = Form(...)):
    cfg = app_settings.get('enhancement.mlx') or {}
    models_dir = Path(cfg.get('models_dir'))
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=400, detail="Invalid model path (not found)")
    # Only allow selections inside the app's models_dir
    try:
        p_resolved = p.resolve()
        models_dir_resolved = models_dir.resolve()
        if models_dir_resolved not in p_resolved.parents and p_resolved != models_dir_resolved:
            raise HTTPException(status_code=400, detail="Selecting external model paths is disabled. Use models in the app's models folder.")
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to resolve model path")

    # Save selection
    app_settings.set('enhancement.mlx.model_path', str(p))
    return { 'success': True, 'selected': str(p) }
