"""
Test Gemma 4 E4B vision-enhanced transcript processing.

Simulates the photo-capture feature: a voice transcript with image markers,
where the model sees both the text and the actual photos to produce
a richer enhanced version.

Usage:
    python scripts/test_vision_enhancement.py --images /path/to/img1.jpg /path/to/img2.jpg ...
"""
import sys
import re
import time
import argparse
from pathlib import Path

sys.path.insert(0, '/Users/tiurihartog/Hackerman/Skrift/backend')

MODEL_PATH = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-4bit"

# Real transcript with image markers (from actual renovation walkthrough)
TRANSCRIPT = """I'm going to go around the house and just talk about everything that happened. An unexpected thing that happened today is in the kitchen on the right side of the kitchen, the whole wall came off.

[[img_001]]

You can see that all the render let go.

[[img_002]]

And then I just had to keep going. It was so easy to loosen up. So that's a curious one. Then here to the left of the door entrance, you can see it's kind of a splotchy mess.

[[img_003]]

In this picture, I took away some tiles next to the door. Kind of curious to see what's in there and if we should remove it or not. I'm not too certain, so I stopped.

[[img_004]]

Then we have the wall on the left. I took down another layer of bricks.

[[img_005]]

And the cat hole has been increased in size. Then to the right, if you come out of the kitchen and walk into the hallway, a lot has happened. You can see that the back wall has been fully stripped. Apparently it was super wet."""


PROMPT_TEXT_ONLY = """You are a copy editor enhancing a voice memo transcript about a house renovation.
- Fix grammar, remove filler words and stutters
- Keep the original meaning, tone, and observations
- Preserve all [[img_XXX]] markers exactly as they appear
- Do NOT describe what might be in the images — just clean up the surrounding text
- Output only the enhanced text, nothing else"""

DESCRIBE_PROMPT = """Based on the photo and the speaker's context, write a single factual sentence describing what's visible. Focus on materials, damage, or notable details the speaker mentioned. Be concise."""

ENHANCE_WITH_VISION_PROMPT = """You are enhancing a voice memo transcript about a house renovation.
You have: the original transcript segment AND a photo description from that exact spot.

Rules:
- Fix grammar, remove filler words/stutters
- Weave the photo details naturally into the text (1 short phrase per image, not a separate paragraph)
- Keep the speaker's voice and tone
- Preserve [[img_XXX]] markers exactly
- Output only the enhanced text"""


def test_text_only():
    """Baseline: enhance transcript without images."""
    print(f"\n{'='*60}")
    print("TEST 1: TEXT-ONLY ENHANCEMENT")
    print(f"{'='*60}")

    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template

    model, processor = load(MODEL_PATH)
    config = model.config

    prompt = apply_chat_template(
        processor, config,
        f"System: {PROMPT_TEXT_ONLY}\n\nTranscript:\n{TRANSCRIPT}",
        num_images=0,
    )

    start = time.time()
    out = generate(model, processor, prompt=prompt, max_tokens=500, verbose=False, temp=0.5)
    elapsed = time.time() - start

    text = out.text if hasattr(out, 'text') else str(out)
    print(f"\nTime: {elapsed:.2f}s")
    print(f"\nOutput:\n{'-'*40}")
    print(text)
    print(f"{'-'*40}")
    return {"time": elapsed, "output": text}


def describe_image(model, processor, config, image_path: str, context: str) -> tuple:
    """Get a vision-based description of a single image with transcript context."""
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template

    prompt = apply_chat_template(
        processor, config,
        f"{DESCRIBE_PROMPT}\n\nSpeaker context: \"{context}\"",
        num_images=1,
    )

    start = time.time()
    out = generate(model, processor, prompt=prompt, image=image_path, max_tokens=100, verbose=False, temp=0.3)
    elapsed = time.time() - start

    text = out.text if hasattr(out, 'text') else str(out)
    return text.strip(), elapsed


def test_full_pipeline(image_paths: list):
    """Full pipeline: describe each image, then enhance transcript with descriptions."""
    print(f"\n{'='*60}")
    print(f"TEST 2: VISION-ENHANCED PIPELINE ({len(image_paths)} images)")
    print(f"{'='*60}")

    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template

    model, processor = load(MODEL_PATH)
    config = model.config

    # Step 1: Describe each image
    print("\n--- Step 1: Image descriptions ---")
    descriptions = {}
    total_desc_time = 0

    parts = re.split(r'(\[\[img_\d{3}\]\])', TRANSCRIPT)

    for i, part in enumerate(parts):
        marker_match = re.match(r'\[\[img_(\d{3})\]\]', part)
        if marker_match:
            img_idx = int(marker_match.group(1)) - 1
            if img_idx < len(image_paths):
                # Get surrounding context
                before = parts[i-1].strip() if i > 0 else ""
                after = parts[i+1].strip() if i + 1 < len(parts) else ""
                context = f"{before[-150:]} ... {after[:150]}"

                desc, elapsed = describe_image(model, processor, config, image_paths[img_idx], context)
                descriptions[part] = desc
                total_desc_time += elapsed
                print(f"  {part}: {elapsed:.1f}s")
                print(f"    -> {desc[:120]}...")

    print(f"\n  Total description time: {total_desc_time:.1f}s ({total_desc_time/len(descriptions):.1f}s avg)")

    # Step 2: Enhance full transcript with image descriptions injected
    print("\n--- Step 2: Full enhancement with descriptions ---")

    # Build transcript with descriptions embedded
    enriched = TRANSCRIPT
    for marker, desc in descriptions.items():
        enriched = enriched.replace(marker, f"{marker}\n[Photo shows: {desc}]")

    prompt = apply_chat_template(
        processor, config,
        f"{ENHANCE_WITH_VISION_PROMPT}\n\nTranscript with photo descriptions:\n{enriched}",
        num_images=0,
    )

    start = time.time()
    out = generate(model, processor, prompt=prompt, max_tokens=600, verbose=False, temp=0.5)
    enhance_time = time.time() - start

    text = out.text if hasattr(out, 'text') else str(out)

    total_time = total_desc_time + enhance_time
    print(f"\n  Enhancement time: {enhance_time:.1f}s")
    print(f"  Total pipeline time: {total_time:.1f}s")
    print(f"\nFinal output:\n{'-'*40}")
    print(text)
    print(f"{'-'*40}")
    return {"time": total_time, "desc_time": total_desc_time, "enhance_time": enhance_time, "output": text, "descriptions": descriptions}


def test_single_direct(image_path: str):
    """Direct single-image test: just describe what the model sees."""
    print(f"\n{'='*60}")
    print(f"TEST 3: DIRECT VISION — {Path(image_path).name}")
    print(f"{'='*60}")

    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template

    model, processor = load(MODEL_PATH)
    config = model.config

    prompt = apply_chat_template(
        processor, config,
        "Describe exactly what you see in this photo. Be specific about colors, materials, and details visible.",
        num_images=1,
    )

    start = time.time()
    out = generate(model, processor, prompt=prompt, image=image_path, max_tokens=200, verbose=False, temp=0.3)
    elapsed = time.time() - start

    text = out.text if hasattr(out, 'text') else str(out)
    print(f"\nTime: {elapsed:.2f}s")
    print(f"\nDescription:\n{text}")
    return {"time": elapsed, "output": text}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test vision-enhanced transcript processing")
    parser.add_argument("--images", nargs="*", help="Paths to images (up to 5)")
    parser.add_argument("--direct-only", action="store_true", help="Only run direct image description")
    parser.add_argument("--skip-text", action="store_true", help="Skip text-only baseline")
    args = parser.parse_args()

    print("Gemma 4 E4B Vision Enhancement Test")
    print(f"Model: {MODEL_PATH}")

    if not args.images:
        print("\nNo images provided. Usage:")
        print("  python scripts/test_vision_enhancement.py --images img1.jpg img2.jpg ...")
        sys.exit(1)

    image_paths = args.images
    print(f"Images: {len(image_paths)}")

    if args.direct_only:
        for p in image_paths:
            test_single_direct(p)
    else:
        if not args.skip_text:
            r1 = test_text_only()
        r2 = test_full_pipeline(image_paths)

    print(f"\n{'='*60}")
    print("DONE")
    print(f"{'='*60}")
