#!/usr/bin/env python3
"""
Vision Pipeline Test Harness
=============================
Tests different approaches for photo-enhanced copy-editing.

Goal: Find the best way to produce clean copy-edited text that:
  1. Weaves photo descriptions naturally into the prose
  2. Preserves [[img_NNN]] markers for UI rendering
  3. Works reliably within 24GB unified memory

Test file: 2d441707 (drone recording with 3 photos)

Approaches:
  A3: Programmatic injection — E4B plain copy-edit, descriptions inserted after
  A2: 26B for both — describe photos with vision, then 26B copy-edits text
  A4: E4B copy-edit first, then 26B adds photo descriptions via splice
  A1: 26B single-pass VLM with all photos at once

IMPORTANT: Only one model loaded at a time. Each test unloads before the next.
"""

import sys, os, json, time, re, gc

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# ── Test data ──────────────────────────────────────────────

TEST_DIR = "/Users/tiurihartog/Documents/Voice Transcription Pipeline Audio Output/2d441707-3ff7-431c-9ec7-9043c87a373b_memo_ed609ca3-0a51-4871-a32a-2004211780c2"

TRANSCRIPT = (
    "Drone, see what happened, huh? And I can show you this as well. "
    "So this is the drone. Take a picture\n\n[[img_001]]\n\n of it. "
    "That's the front\n\n[[img_002]]\n\n cover. And then we also have "
    "the back cover.\n\n[[img_003]]\n\n It's an armored drone. Very nice."
)

IMAGE_PATHS = [
    os.path.join(TEST_DIR, "images", f)
    for f in [
        "photo_ed609ca3-0a51-4871-a32a-2004211780c2_001.jpg",
        "photo_ed609ca3-0a51-4871-a32a-2004211780c2_002.jpg",
        "photo_ed609ca3-0a51-4871-a32a-2004211780c2_003.jpg",
    ]
]

COPY_EDIT_PROMPT = """Clean up this transcript. The author may switch between English and Dutch mid-sentence — this is intentional, keep it exactly as-is.

Do:
- Remove filler words (um, uh, like, you know, so basically, I mean, yeah so).
- Fix spelling and grammar.
- Add punctuation and paragraph breaks at natural pauses.
- Preserve [[double bracket links]] exactly.
- When the speaker immediately rephrases the same thought, collapse into the final version.
- Remove false starts and repeated words from thinking out loud.

Do not:
- Rephrase, rewrite, or restructure sentences.
- Translate anything between languages.
- Add formality — it should still sound like the person speaking.
- Add any preamble, heading, or explanation.

Output only the cleaned text."""

MODEL_26B = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-26b-a4b-it-4bit"
MODEL_E4B = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-8bit"

# ── Helpers ────────────────────────────────────────────────

def unload_model():
    """Fully unload any cached model and free Metal memory."""
    from services.mlx_cache import get_model_cache
    cache = get_model_cache()
    cache.clear_cache(reason="test harness")
    gc.collect()
    try:
        import mlx.core as mx
        mx.metal.clear_cache()
    except Exception:
        pass
    time.sleep(1)

def get_rss_gb():
    import psutil
    return psutil.Process().memory_info().rss / (1024**3)

def generate_text(prompt, input_text, model_path, max_tokens=512, temperature=0.7, enable_thinking=False):
    """Stream text generation, return full result.
    If enable_thinking=True, uses the chat template with thinking mode and strips
    the thinking channel from the output."""
    if not enable_thinking:
        from services.mlx_runner import stream_with_mlx
        pieces = []
        for piece in stream_with_mlx(prompt, input_text, model_path, max_tokens, temperature):
            pieces.append(piece)
            print(piece, end='', flush=True)
        print()
        return ''.join(pieces)

    # Thinking mode: build prompt manually with enable_thinking=True
    from services.mlx_cache import get_model_cache
    cache = get_model_cache()
    model, tokenizer = cache.get_model(model_path)

    from transformers import AutoTokenizer
    hf_tok = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)

    # Load jinja template from file if chat_template is empty
    template_path = os.path.join(model_path, 'chat_template.jinja')
    if not getattr(hf_tok, 'chat_template', None) and os.path.exists(template_path):
        with open(template_path) as f:
            hf_tok.chat_template = f.read()

    messages = [
        {"role": "system", "content": prompt.strip()},
        {"role": "user", "content": f"Transcript:\n{input_text}"},
    ]
    final_prompt = hf_tok.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True,
        enable_thinking=True,
    )
    print(f"  [thinking mode prompt: {len(final_prompt)} chars]")

    # Stream generation
    from mlx_lm import stream_generate
    pieces = []
    for r in stream_generate(model, tokenizer, final_prompt, max_tokens=max_tokens):
        piece = getattr(r, 'text', None)
        if piece:
            pieces.append(piece)
            print(piece, end='', flush=True)
    print()

    raw = ''.join(pieces)

    # Strip thinking channel: <|channel>thought\n...\n<channel|>
    stripped = re.sub(r'<\|channel>thought\n.*?\n<channel\|>', '', raw, flags=re.DOTALL)
    # Also strip any remaining special tokens
    stripped = re.sub(r'<\|?turn\|?>|<\|?model\|?>', '', stripped)
    stripped = stripped.strip()

    if len(stripped) < len(raw):
        thinking_part = raw[:len(raw) - len(stripped)]
        # Find thinking content
        think_match = re.search(r'<\|channel>thought\n(.*?)\n<channel\|>', raw, re.DOTALL)
        if think_match:
            print(f"\n  [THINKING ({len(think_match.group(1))} chars)]: {think_match.group(1)[:200]}...")

    return stripped

def generate_vision(prompt, input_text, image_path, model_path, max_tokens=80, temperature=0.5):
    """Non-streaming vision generation."""
    from services.mlx_runner import generate_vision_with_mlx
    result = generate_vision_with_mlx(prompt, input_text, image_path, model_path, max_tokens, temperature)
    return result.strip()

def score_result(name, output):
    """Score a result on key criteria."""
    print(f"\n{'='*60}")
    print(f"RESULT: {name}")
    print(f"{'='*60}")
    print(output)
    print(f"\n--- Scorecard ---")

    # Check marker preservation
    markers_found = re.findall(r'\[\[img_\d{3}\]\]', output)
    markers_expected = ['[[img_001]]', '[[img_002]]', '[[img_003]]']
    markers_ok = set(markers_expected) == set(markers_found)
    print(f"  Markers preserved: {'YES' if markers_ok else 'NO'} (found: {markers_found})")

    # Check no [Photo N:] leftovers
    photo_refs = re.findall(r'\[Photo \d+:[^\]]*\]', output)
    print(f"  Photo refs cleaned: {'YES' if not photo_refs else 'NO — leftover: ' + str(photo_refs)}")

    # Check no [[img_XXX]]
    bad_markers = re.findall(r'\[\[img_X+\]\]', output)
    print(f"  No mangled markers: {'YES' if not bad_markers else 'NO — found: ' + str(bad_markers)}")

    # Check filler removal
    fillers = ['huh?', 'so basically', 'you know', 'I mean']
    found_fillers = [f for f in fillers if f.lower() in output.lower()]
    print(f"  Fillers removed: {'YES' if not found_fillers else 'SOME LEFT: ' + str(found_fillers)}")

    # Length
    print(f"  Output length: {len(output)} chars ({len(output.split())} words)")
    print()
    return {
        'markers_ok': markers_ok,
        'photo_refs_clean': not photo_refs,
        'no_mangled': not bad_markers,
        'fillers_clean': not found_fillers,
        'length': len(output),
    }


# ── APPROACH 3: Programmatic injection ────────────────────
def test_approach_3():
    """E4B does plain copy-edit (no photo awareness), then we insert
    photo descriptions deterministically as blockquotes after markers."""
    print("\n" + "="*70)
    print("APPROACH 3: Programmatic injection")
    print("  E4B copy-edits → deterministic photo description insert")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()

    # Step 1: Plain copy-edit with E4B — no mention of photos at all
    # Strip img markers temporarily so the model doesn't mangle them
    clean_input = TRANSCRIPT
    marker_positions = {}  # paragraph_index → marker
    lines = clean_input.split('\n')
    clean_lines = []
    for line in lines:
        m = re.match(r'\[\[img_(\d{3})\]\]', line.strip())
        if m:
            marker_positions[len(clean_lines)] = line.strip()
        else:
            clean_lines.append(line)
    text_only = '\n'.join(clean_lines)

    print(f"\n[Step 1] E4B copy-edit (text only, {len(text_only)} chars)...")
    t0 = time.time()
    edited = generate_text(COPY_EDIT_PROMPT, text_only, MODEL_E4B, max_tokens=512)
    t1 = time.time()
    print(f"  Copy-edit took {t1-t0:.1f}s")

    # Step 2: Describe photos with 26B vision
    unload_model()
    print(f"\n[Step 2] 26B vision — describing {len(IMAGE_PATHS)} photos...")

    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition. "
        "Do not read or transcribe text visible in the photo."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(vision_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t2 = time.time()
    print(f"  Vision took {t2-t1:.1f}s")

    unload_model()

    # Step 3: Deterministic assembly — insert markers + descriptions
    # Split edited text into paragraphs, insert markers at approximate positions
    edited_paras = [p for p in edited.split('\n') if p.strip()]
    # The original transcript had 3 images roughly at: after "take a picture", after "front", after "back cover"
    # Strategy: for each img marker, find the sentence it was near and insert after it
    # Simple heuristic: distribute markers proportionally through the text
    result_parts = []
    total_paras = len(edited_paras)
    img_insert_points = {}

    # Map each image to its approximate position in the text
    # Original positions were roughly at 33%, 50%, 75% of the text
    for img_num in sorted(descriptions.keys()):
        # Find the best paragraph by keyword matching from the original
        if img_num == 1:
            keywords = ['picture', 'photo', 'drone']
        elif img_num == 2:
            keywords = ['front']
        else:
            keywords = ['back']
        best_idx = -1
        for idx, para in enumerate(edited_paras):
            if any(kw in para.lower() for kw in keywords):
                best_idx = idx
                break
        if best_idx < 0:
            # Fallback: proportional placement
            best_idx = min(int(img_num / (len(descriptions) + 1) * total_paras), total_paras - 1)
        img_insert_points[best_idx] = img_num

    for idx, para in enumerate(edited_paras):
        result_parts.append(para)
        if idx in img_insert_points:
            img_num = img_insert_points[idx]
            desc = descriptions[img_num]
            result_parts.append(f"\n[[img_{img_num:03d}]]")
            if desc:
                result_parts.append(f"> {desc}")

    # Add any unplaced markers at the end
    placed = set(img_insert_points.values())
    for img_num in sorted(descriptions.keys()):
        if img_num not in placed:
            desc = descriptions[img_num]
            result_parts.append(f"\n[[img_{img_num:03d}]]")
            if desc:
                result_parts.append(f"> {desc}")

    final = '\n\n'.join(result_parts)
    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {time.time()-t0:.1f}s")

    return score_result("Approach 3: Programmatic injection", final)


# ── APPROACH 2: 26B for both phases ───────────────────────
def test_approach_2():
    """26B describes photos with vision, then 26B copy-edits with
    descriptions injected. Same model stays loaded (but reloads as text-only)."""
    print("\n" + "="*70)
    print("APPROACH 2: 26B for both phases")
    print("  26B VLM describes → 26B text copy-edits with descriptions")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()

    # Phase 1: Vision descriptions with 26B
    print(f"\n[Phase 1] 26B vision — describing {len(IMAGE_PATHS)} photos...")
    t0 = time.time()

    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition. "
        "Do not read or transcribe text visible in the photo."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(vision_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t1 = time.time()
    print(f"  Vision took {t1-t0:.1f}s")

    # Phase 2: Copy-edit with 26B (will reload as text-only automatically)
    # Build enriched transcript
    enriched = TRANSCRIPT
    for img_num, desc in descriptions.items():
        marker = f"[[img_{img_num:03d}]]"
        if desc:
            enriched = enriched.replace(marker, f"\n[Photo {img_num}: {desc}]\n")

    enhanced_prompt = COPY_EDIT_PROMPT + (
        "\n\nThe text contains [Photo N: description] markers where the speaker took photos. "
        "Weave each photo's description naturally into the surrounding text as a short clause. "
        "Remove the [Photo N: ...] markers from the output. "
        "Keep the [[img_NNN]] markers — add them back where each photo was, on their own line."
    )

    print(f"\n[Phase 2] 26B text copy-edit ({len(enriched)} chars)...")
    # Force text-only reload of 26B
    unload_model()
    edited = generate_text(enhanced_prompt, enriched, MODEL_26B, max_tokens=600)
    t2 = time.time()
    print(f"  Copy-edit took {t2-t1:.1f}s")

    # Post-process: ensure markers present, clean leftovers
    for img_num in descriptions:
        marker = f"[[img_{img_num:03d}]]"
        if marker not in edited:
            photo_ref = f"[Photo {img_num}:"
            pos = edited.find(photo_ref)
            if pos >= 0:
                end = edited.find("]", pos)
                if end >= 0:
                    edited = edited[:pos] + marker + edited[end+1:]
            else:
                edited += f"\n\n{marker}\n"
    edited = re.sub(r'\[Photo \d+:[^\]]*\]', '', edited)
    edited = re.sub(r'\n{3,}', '\n\n', edited).strip()

    unload_model()
    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {time.time()-t0:.1f}s")

    return score_result("Approach 2: 26B for both", edited)


# ── APPROACH 4: Copy-edit first, vision splice ────────────
def test_approach_4():
    """E4B copy-edits plain text first. Then 26B generates a one-sentence
    description per photo. Descriptions are spliced in programmatically."""
    print("\n" + "="*70)
    print("APPROACH 4: Copy-edit first, vision splice")
    print("  E4B copy-edits plain text → 26B describes photos → splice")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()

    # Step 1: Copy-edit with E4B — keep markers intact
    marker_aware_prompt = COPY_EDIT_PROMPT + (
        "\n\nIMPORTANT: The text contains [[img_NNN]] markers (e.g. [[img_001]]). "
        "Copy these markers EXACTLY as-is into your output. Do not modify, remove, "
        "or renumber them. They mark where photos were taken."
    )

    print(f"\n[Step 1] E4B copy-edit (marker-aware, {len(TRANSCRIPT)} chars)...")
    t0 = time.time()
    edited = generate_text(marker_aware_prompt, TRANSCRIPT, MODEL_E4B, max_tokens=512)
    t1 = time.time()
    print(f"  Copy-edit took {t1-t0:.1f}s")

    # Step 2: Describe photos with 26B
    unload_model()
    print(f"\n[Step 2] 26B vision — describing photos...")

    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        # Give the model some context from the edited text around the marker
        marker = f"[[img_{img_num:03d}]]"
        ctx_start = max(0, edited.find(marker) - 100) if marker in edited else 0
        ctx_end = min(len(edited), edited.find(marker) + 100) if marker in edited else 100
        context = edited[ctx_start:ctx_end].replace(marker, '').strip()
        full_prompt = vision_prompt + f' Context from speaker: "{context[:80]}"'

        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(full_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t2 = time.time()
    print(f"  Vision took {t2-t1:.1f}s")

    unload_model()

    # Step 3: Splice — insert description as prose before each marker
    final = edited
    for img_num in sorted(descriptions.keys(), reverse=True):  # reverse to preserve positions
        marker = f"[[img_{img_num:03d}]]"
        desc = descriptions[img_num]
        if marker in final and desc:
            # Insert description as a sentence before the marker
            replacement = f"{desc}\n\n{marker}"
            final = final.replace(marker, replacement)

    final = re.sub(r'\n{3,}', '\n\n', final).strip()

    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {time.time()-t0:.1f}s")

    return score_result("Approach 4: Copy-edit first, vision splice", final)


# ── APPROACH 1: 26B single-pass VLM ──────────────────────
def test_approach_1():
    """26B VLM processes the transcript + first photo in a single pass.
    Note: mlx_vlm typically supports one image per call, so we may need
    to do one call per image segment."""
    print("\n" + "="*70)
    print("APPROACH 1: 26B single-pass VLM")
    print("  26B VLM does copy-edit + photo description in one pass per segment")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()

    vision_edit_prompt = (
        "Clean up this voice memo segment. You can see the photo the speaker took at this moment.\n\n"
        "Rules:\n"
        "1. Fix grammar and remove filler words. Keep the speaker's casual voice.\n"
        "2. Add one short detail from the photo, woven into the text as a natural clause.\n"
        "3. Do not read text in the photo.\n"
        "4. Output only the enhanced text segment. No preamble."
    )

    # Split transcript into segments around markers
    parts = re.split(r'(\[\[img_\d{3}\]\])', TRANSCRIPT)
    segments = []  # (text_before, img_num, text_after)

    t0 = time.time()
    result_parts = []

    for i, part in enumerate(parts):
        m = re.match(r'\[\[img_(\d{3})\]\]', part)
        if m:
            img_num = int(m.group(1))
            before = parts[i-1].strip() if i > 0 else ""
            after = parts[i+1].strip() if i+1 < len(parts) else ""
            segment_text = f"{before} [PHOTO HERE] {after}"
            img_path = IMAGE_PATHS[img_num - 1] if img_num <= len(IMAGE_PATHS) else None

            if img_path and os.path.exists(img_path):
                print(f"\n  Segment with img_{img_num:03d}: ", end='')
                enhanced = generate_vision(
                    vision_edit_prompt, segment_text, img_path, MODEL_26B,
                    max_tokens=150, temperature=0.7
                )
                print(f"{enhanced[:100]}...")
                result_parts.append(enhanced)
                result_parts.append(f"\n[[img_{img_num:03d}]]\n")
            else:
                result_parts.append(part)
        elif not any(re.match(r'\[\[img_\d{3}\]\]', parts[j]) for j in [max(0,i-1), min(len(parts)-1, i+1)] if j != i):
            # Only add text parts that aren't adjacent to an image (those are handled above)
            if part.strip():
                result_parts.append(part.strip())

    t1 = time.time()
    unload_model()

    final = '\n\n'.join(p for p in result_parts if p.strip())
    final = re.sub(r'\n{3,}', '\n\n', final).strip()

    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {t1-t0:.1f}s")

    return score_result("Approach 1: 26B single-pass VLM", final)


# ── APPROACH 2E: E4B for both phases (no thinking) ────────
def test_approach_2e():
    """Same as A2 but uses E4B for BOTH phases instead of 26B.
    No thinking mode. Tests whether E4B can handle the weaving instruction."""
    print("\n" + "="*70)
    print("APPROACH 2E: E4B for both phases (no thinking)")
    print("  E4B describes photos (text only) → E4B copy-edits with descriptions")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()

    # Phase 1: Describe photos with E4B (text-only — no vision, describe from filename/context)
    # Since E4B can't do vision, we use 26B for descriptions then E4B for copy-edit
    # Actually — E4B IS a text-only model. We still need 26B for vision.
    # So this test is: 26B describes photos, E4B copy-edits with descriptions.
    print(f"\n[Phase 1] 26B vision — describing {len(IMAGE_PATHS)} photos...")
    t0 = time.time()

    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition. "
        "Do not read or transcribe text visible in the photo."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(vision_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t1 = time.time()
    print(f"  Vision took {t1-t0:.1f}s")

    # Phase 2: Copy-edit with E4B (no thinking)
    unload_model()

    enriched = TRANSCRIPT
    for img_num, desc in descriptions.items():
        marker = f"[[img_{img_num:03d}]]"
        if desc:
            enriched = enriched.replace(marker, f"\n[Photo {img_num}: {desc}]\n")

    enhanced_prompt = COPY_EDIT_PROMPT + (
        "\n\nThe text contains [Photo N: description] markers where the speaker took photos. "
        "Weave each photo's description naturally into the surrounding text as a short clause. "
        "Remove the [Photo N: ...] markers from the output. "
        "Keep the [[img_NNN]] markers — add them back where each photo was, on their own line."
    )

    print(f"\n[Phase 2] E4B text copy-edit, NO thinking ({len(enriched)} chars)...")
    edited = generate_text(enhanced_prompt, enriched, MODEL_E4B, max_tokens=600, enable_thinking=False)
    t2 = time.time()
    print(f"  Copy-edit took {t2-t1:.1f}s")

    # Post-process
    for img_num in descriptions:
        marker = f"[[img_{img_num:03d}]]"
        if marker not in edited:
            photo_ref = f"[Photo {img_num}:"
            pos = edited.find(photo_ref)
            if pos >= 0:
                end = edited.find("]", pos)
                if end >= 0:
                    edited = edited[:pos] + marker + edited[end+1:]
            else:
                edited += f"\n\n{marker}\n"
    edited = re.sub(r'\[Photo \d+:[^\]]*\]', '', edited)
    edited = re.sub(r'\n{3,}', '\n\n', edited).strip()

    unload_model()
    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {time.time()-t0:.1f}s")

    return score_result("Approach 2E: E4B both (no thinking)", edited)


# ── APPROACH 2ET: E4B for both phases (with thinking) ─────
def test_approach_2et():
    """Same as A2E but with thinking mode enabled on E4B.
    Tests whether thinking helps E4B follow the complex instruction."""
    print("\n" + "="*70)
    print("APPROACH 2ET: E4B for both phases (WITH thinking)")
    print("  26B vision describes → E4B copy-edits with descriptions + thinking")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()

    # Phase 1: Vision descriptions with 26B (same as 2E)
    print(f"\n[Phase 1] 26B vision — describing {len(IMAGE_PATHS)} photos...")
    t0 = time.time()

    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition. "
        "Do not read or transcribe text visible in the photo."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(vision_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t1 = time.time()
    print(f"  Vision took {t1-t0:.1f}s")

    # Phase 2: Copy-edit with E4B + thinking mode
    unload_model()

    enriched = TRANSCRIPT
    for img_num, desc in descriptions.items():
        marker = f"[[img_{img_num:03d}]]"
        if desc:
            enriched = enriched.replace(marker, f"\n[Photo {img_num}: {desc}]\n")

    enhanced_prompt = COPY_EDIT_PROMPT + (
        "\n\nThe text contains [Photo N: description] markers where the speaker took photos. "
        "Weave each photo's description naturally into the surrounding text as a short clause. "
        "Remove the [Photo N: ...] markers from the output. "
        "Keep the [[img_NNN]] markers — add them back where each photo was, on their own line."
    )

    print(f"\n[Phase 2] E4B text copy-edit, WITH thinking ({len(enriched)} chars)...")
    # More tokens to account for thinking output
    edited = generate_text(enhanced_prompt, enriched, MODEL_E4B, max_tokens=1200, enable_thinking=True)
    t2 = time.time()
    print(f"  Copy-edit took {t2-t1:.1f}s")

    # Post-process
    for img_num in descriptions:
        marker = f"[[img_{img_num:03d}]]"
        if marker not in edited:
            photo_ref = f"[Photo {img_num}:"
            pos = edited.find(photo_ref)
            if pos >= 0:
                end = edited.find("]", pos)
                if end >= 0:
                    edited = edited[:pos] + marker + edited[end+1:]
            else:
                edited += f"\n\n{marker}\n"
    edited = re.sub(r'\[Photo \d+:[^\]]*\]', '', edited)
    edited = re.sub(r'\n{3,}', '\n\n', edited).strip()

    unload_model()
    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {time.time()-t0:.1f}s")

    return score_result("Approach 2ET: E4B both (thinking)", edited)


# ── APPROACH 1E: E4B single-pass (no thinking) ───────────
def test_approach_1e():
    """Like A1 but uses E4B for the per-segment edit (no vision — just text).
    26B still does vision descriptions, then E4B edits each segment with
    the description injected as text context."""
    print("\n" + "="*70)
    print("APPROACH 1E: E4B per-segment edit (no thinking)")
    print("  26B vision describes → E4B edits each segment with description")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()
    t0 = time.time()

    # First: get vision descriptions with 26B
    print(f"\n[Phase 1] 26B vision — describing {len(IMAGE_PATHS)} photos...")
    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(vision_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t1 = time.time()
    print(f"  Vision took {t1-t0:.1f}s")

    # Switch to E4B for per-segment editing
    unload_model()
    print(f"\n[Phase 2] E4B per-segment edit (no thinking)...")

    segment_prompt = (
        "Clean up this voice memo segment. Fix grammar, remove filler words. "
        "Keep the speaker's casual voice.\n"
        "A photo was taken here. The photo shows: {description}\n"
        "Weave ONE short detail from the photo naturally into the text.\n"
        "Output only the enhanced text. No preamble."
    )

    parts = re.split(r'(\[\[img_\d{3}\]\])', TRANSCRIPT)
    result_parts = []

    for i, part in enumerate(parts):
        m = re.match(r'\[\[img_(\d{3})\]\]', part)
        if m:
            img_num = int(m.group(1))
            before = parts[i-1].strip() if i > 0 else ""
            after = parts[i+1].strip() if i+1 < len(parts) else ""
            segment_text = f"{before} {after}"
            desc = descriptions.get(img_num, "")

            if desc:
                prompt = segment_prompt.format(description=desc)
                print(f"\n  Segment img_{img_num:03d}: ", end='')
                enhanced = generate_text(prompt, segment_text, MODEL_E4B, max_tokens=150, enable_thinking=False)
                print(f"  → {enhanced[:80]}...")
                result_parts.append(enhanced)
            else:
                result_parts.append(before)

            result_parts.append(f"\n[[img_{img_num:03d}]]\n")
        elif not any(re.match(r'\[\[img_\d{3}\]\]', parts[j]) for j in [max(0,i-1), min(len(parts)-1, i+1)] if j != i):
            if part.strip():
                result_parts.append(part.strip())

    t2 = time.time()
    unload_model()

    final = '\n\n'.join(p for p in result_parts if p.strip())
    final = re.sub(r'\n{3,}', '\n\n', final).strip()

    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {t2-t0:.1f}s")

    return score_result("Approach 1E: E4B per-segment (no thinking)", final)


# ── APPROACH 1ET: E4B single-pass (with thinking) ────────
def test_approach_1et():
    """Like A1E but with thinking mode enabled on E4B per-segment edits."""
    print("\n" + "="*70)
    print("APPROACH 1ET: E4B per-segment edit (WITH thinking)")
    print("  26B vision describes → E4B edits each segment with thinking")
    print("="*70)

    unload_model()
    rss_before = get_rss_gb()
    t0 = time.time()

    # First: get vision descriptions with 26B
    print(f"\n[Phase 1] 26B vision — describing {len(IMAGE_PATHS)} photos...")
    descriptions = {}
    vision_prompt = (
        "Describe what you see in this photo in ONE short sentence. "
        "Focus on physical details: objects, colors, materials, condition."
    )
    for i, img_path in enumerate(IMAGE_PATHS):
        img_num = i + 1
        print(f"  Photo {img_num}: ", end='')
        desc = generate_vision(vision_prompt, "", img_path, MODEL_26B, max_tokens=60)
        descriptions[img_num] = desc
        print(f"{desc}")
    t1 = time.time()
    print(f"  Vision took {t1-t0:.1f}s")

    # Switch to E4B for per-segment editing with thinking
    unload_model()
    print(f"\n[Phase 2] E4B per-segment edit (WITH thinking)...")

    segment_prompt = (
        "Clean up this voice memo segment. Fix grammar, remove filler words. "
        "Keep the speaker's casual voice.\n"
        "A photo was taken here. The photo shows: {description}\n"
        "Weave ONE short detail from the photo naturally into the text.\n"
        "Output only the enhanced text. No preamble."
    )

    parts = re.split(r'(\[\[img_\d{3}\]\])', TRANSCRIPT)
    result_parts = []

    for i, part in enumerate(parts):
        m = re.match(r'\[\[img_(\d{3})\]\]', part)
        if m:
            img_num = int(m.group(1))
            before = parts[i-1].strip() if i > 0 else ""
            after = parts[i+1].strip() if i+1 < len(parts) else ""
            segment_text = f"{before} {after}"
            desc = descriptions.get(img_num, "")

            if desc:
                prompt = segment_prompt.format(description=desc)
                print(f"\n  Segment img_{img_num:03d}: ", end='')
                enhanced = generate_text(prompt, segment_text, MODEL_E4B, max_tokens=500, enable_thinking=True)
                print(f"  → {enhanced[:80]}...")
                result_parts.append(enhanced)
            else:
                result_parts.append(before)

            result_parts.append(f"\n[[img_{img_num:03d}]]\n")
        elif not any(re.match(r'\[\[img_\d{3}\]\]', parts[j]) for j in [max(0,i-1), min(len(parts)-1, i+1)] if j != i):
            if part.strip():
                result_parts.append(part.strip())

    t2 = time.time()
    unload_model()

    final = '\n\n'.join(p for p in result_parts if p.strip())
    final = re.sub(r'\n{3,}', '\n\n', final).strip()

    rss_after = get_rss_gb()
    print(f"\n  RSS: {rss_before:.2f}GB → {rss_after:.2f}GB")
    print(f"  Total time: {t2-t0:.1f}s")

    return score_result("Approach 1ET: E4B per-segment (thinking)", final)


# ── Main ──────────────────────────────────────────────────

if __name__ == "__main__":
    # Verify test data
    for p in IMAGE_PATHS:
        assert os.path.exists(p), f"Missing: {p}"

    print("Vision Pipeline Test Harness")
    print(f"Test file: {TEST_DIR}")
    print(f"Models: 26B={os.path.basename(MODEL_26B)}, E4B={os.path.basename(MODEL_E4B)}")
    print(f"Images: {len(IMAGE_PATHS)}")
    print(f"Transcript: {len(TRANSCRIPT)} chars")
    print()

    # Parse CLI arg for which test to run
    tests = {
        '3':   ('Approach 3: Programmatic injection', test_approach_3),
        '2':   ('Approach 2: 26B for both', test_approach_2),
        '4':   ('Approach 4: Copy-edit first, vision splice', test_approach_4),
        '1':   ('Approach 1: 26B single-pass VLM', test_approach_1),
        '2e':  ('Approach 2E: E4B both (no thinking)', test_approach_2e),
        '2et': ('Approach 2ET: E4B both (WITH thinking)', test_approach_2et),
        '1e':  ('Approach 1E: E4B per-segment (no thinking)', test_approach_1e),
        '1et': ('Approach 1ET: E4B per-segment (WITH thinking)', test_approach_1et),
    }

    if len(sys.argv) > 1:
        choice = sys.argv[1].lower()
        if choice in tests:
            name, fn = tests[choice]
            print(f"Running: {name}")
            fn()
        elif choice == 'all':
            results = {}
            for key in ['3', '2', '4', '1', '2e', '2et', '1e', '1et']:
                name, fn = tests[key]
                results[name] = fn()
            print("\n" + "="*70)
            print("FINAL COMPARISON")
            print("="*70)
            for name, scores in results.items():
                passed = sum(1 for v in [scores['markers_ok'], scores['photo_refs_clean'], scores['no_mangled'], scores['fillers_clean']] if v)
                print(f"  {name}: {passed}/4 checks passed, {scores['length']} chars")
        else:
            print(f"Unknown test: {choice}")
            print("Usage: python test_vision_pipeline.py [1|2|3|4|2e|2et|1e|1et|all]")
    else:
        print("Usage: python test_vision_pipeline.py [1|2|3|4|2e|2et|1e|1et|all]")
        print("\nTests (run one at a time to avoid memory issues):")
        for key, (name, _) in sorted(tests.items()):
            print(f"  {key}: {name}")
