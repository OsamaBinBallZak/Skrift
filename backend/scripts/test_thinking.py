"""
Test Gemma 4 E4B thinking vs no-thinking mode.

Gemma 4 uses <|think|> token in the system prompt to enable thinking.
When disabled on E4B, output is clean (no wrapper tags).
"""
import sys
import time
sys.path.insert(0, '/Users/tiurihartog/Hackerman/Skrift/backend')

MODEL_PATH = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-4bit"

# Sample transcript to enhance
SAMPLE = """So I went to the the store yesterday and um I was looking at the the prices
and they were like really high you know what I mean and I was thinking maybe I should
go to a different store but then I found this this deal on on olive oil which was actually
pretty good so I bought like three bottles and then I also got some some bread and cheese
for dinner tonight."""

PROMPT = """You are a copy editor. Clean up the following voice transcript:
- Fix grammar and punctuation
- Remove filler words and stutters
- Keep the original meaning and tone
- Do not add information that wasn't in the original"""


def test_mode(mode_name, messages, max_tokens=300):
    """Run generation with given messages and measure time."""
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
    prompt_str = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    print(f"\n{'='*60}")
    print(f"MODE: {mode_name}")
    print(f"{'='*60}")
    print(f"Prompt (first 300 chars):\n{prompt_str[:300]}...")
    print(f"\nPrompt length: {len(prompt_str)} chars, ~{len(tok.encode(prompt_str))} tokens")

    # Load model
    try:
        from mlx_lm import load, generate
        model, tokenizer = load(MODEL_PATH)
    except Exception:
        from mlx_vlm import load as vlm_load, generate as vlm_generate
        model, tokenizer = vlm_load(MODEL_PATH)

    # Generate
    start = time.time()

    try:
        from mlx_lm import generate
        output = generate(model, tokenizer, prompt=prompt_str, max_tokens=max_tokens, verbose=False)
    except Exception:
        from mlx_vlm import generate as vlm_generate
        output = vlm_generate(model, tokenizer, prompt=prompt_str, image=None, max_tokens=max_tokens, verbose=False)
        if hasattr(output, 'text'):
            output = output.text

    elapsed = time.time() - start

    # Count output tokens
    out_tokens = len(tok.encode(output))
    tps = out_tokens / elapsed if elapsed > 0 else 0

    print(f"\nTime: {elapsed:.2f}s")
    print(f"Output tokens: {out_tokens}")
    print(f"Tokens/sec: {tps:.1f}")
    print(f"\nOutput:\n{'-'*40}")
    print(output)
    print(f"{'-'*40}")

    return {"time": elapsed, "tokens": out_tokens, "tps": tps, "output": output}


if __name__ == "__main__":
    print("Testing Gemma 4 E4B: Thinking vs No-Thinking")
    print(f"Model: {MODEL_PATH}")
    print(f"Sample length: {len(SAMPLE)} chars")

    # Mode 1: No thinking (standard)
    messages_no_think = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": f"Transcript:\n{SAMPLE}"},
    ]

    # Mode 2: With thinking (add <|think|> to system prompt)
    messages_think = [
        {"role": "system", "content": f"<|think|>\n{PROMPT}"},
        {"role": "user", "content": f"Transcript:\n{SAMPLE}"},
    ]

    r1 = test_mode("NO THINKING", messages_no_think, max_tokens=300)
    r2 = test_mode("WITH THINKING", messages_think, max_tokens=600)  # more tokens for reasoning

    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")
    print(f"No thinking: {r1['time']:.2f}s, {r1['tokens']} tokens, {r1['tps']:.1f} tok/s")
    print(f"With thinking: {r2['time']:.2f}s, {r2['tokens']} tokens, {r2['tps']:.1f} tok/s")
    print(f"Time difference: {r2['time'] - r1['time']:.2f}s ({r2['time']/r1['time']:.1f}x)")
