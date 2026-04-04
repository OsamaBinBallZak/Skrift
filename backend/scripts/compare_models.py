#!/usr/bin/env python3
"""
Compare two MLX models on Skrift enhancement tasks.
Usage: python compare_models.py
"""
import time
import sys
sys.path.insert(0, '/Users/tiurihartog/Hackerman/Skrift/backend')

from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler

# Test texts — deliberately messy, like real voice transcriptions
TESTS = [
    {
        "name": "Rambling voice memo",
        "text": """so i was thinking about like the whole thing with portugal right and my mom
she really wants to go there but the thing is she doesnt have like a passport anymore
and also the flights are super expensive right now especially from amsterdam and i was
like maybe we could drive but thats like two days and she cant sit that long because of
her back thing so yeah i dunno maybe we wait till september when prices drop or something
and also i need to check if her insurance covers like international travel because last
time she went to spain there was this whole thing with the hospital bill""",
    },
    {
        "name": "Quick idea capture",
        "text": """oh oh oh i just had an idea what if we made the app so that when you
shake your phone it starts recording like you dont even have to look at the screen
you just shake and it goes and then shake again to stop and it saves automatically
that would be so cool for when youre driving or cooking or whatever""",
    },
    {
        "name": "Technical discussion",
        "text": """the problem with the current transcription pipeline is that parakeet
sometimes merges words together especially with dutch names like van der berg becomes
vanderberg and then the sanitisation step cant find it in the names list so it doesnt
link it properly we need to maybe add a fuzzy matching step or split compound words
before sanitisation runs""",
    },
]

TITLE_PROMPT = """Generate a concise, descriptive title for this voice memo transcript.
The title should capture the main topic in 3-8 words. Return ONLY the title, nothing else.

Transcript:
{text}

Title:"""

COPYEDIT_PROMPT = """Clean up this voice memo transcript into clear, well-structured prose.
Fix grammar, remove filler words, organize into paragraphs. Keep the author's voice and meaning.
Return ONLY the cleaned text.

Transcript:
{text}

Cleaned text:"""

SUMMARY_PROMPT = """Write a 1-2 sentence summary of this voice memo that captures the key insight or decision.
Return ONLY the summary.

Transcript:
{text}

Summary:"""

def run_test(model, tokenizer, model_name, test, prompt_template, task_name):
    prompt = prompt_template.format(text=test["text"])

    # Format as chat
    messages = [{"role": "user", "content": prompt}]

    if hasattr(tokenizer, "apply_chat_template"):
        formatted = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
    else:
        formatted = prompt

    # For Qwen thinking models, disable thinking mode
    if "qwen" in model_name.lower():
        formatted = formatted + "/no_think\n"

    sampler = make_sampler(temp=0.7, top_p=0.9)

    start = time.time()
    result = generate(
        model, tokenizer, prompt=formatted,
        max_tokens=1024, sampler=sampler,
    )
    elapsed = time.time() - start

    # Clean up result — strip thinking blocks if present
    result = result.strip()
    if "<think>" in result and "</think>" in result:
        result = result.split("</think>")[-1].strip()
    # Remove any trailing special tokens
    for tok in ["<|endoftext|>", "<|end|>", "</s>", "<eos>"]:
        result = result.replace(tok, "").strip()

    return {
        "model": model_name,
        "test": test["name"],
        "task": task_name,
        "result": result,
        "time": elapsed,
    }


def main():
    models_to_test = [
        ("Qwen 3.5 9B", "/Users/tiurihartog/Skrift_dependencies/models/mlx/Qwen3.5-9B-MLX-4bit"),
        ("Gemma 4 26B MoE", "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-26b-a4b-it-4bit"),
    ]

    for model_name, model_path in models_to_test:
        print(f"\n{'='*60}")
        print(f"Loading {model_name} from {model_path}")
        print(f"{'='*60}")

        try:
            model, tokenizer = load(model_path)
        except Exception as e:
            print(f"  FAILED to load: {e}")
            continue

        for test in TESTS:
            print(f"\n--- Test: {test['name']} ---")

            # Title
            r = run_test(model, tokenizer, model_name, test, TITLE_PROMPT, "title")
            print(f"\n  TITLE ({r['time']:.1f}s):")
            print(f"  {r['result'][:100]}")

            # Copy edit
            r = run_test(model, tokenizer, model_name, test, COPYEDIT_PROMPT, "copyedit")
            print(f"\n  COPY EDIT ({r['time']:.1f}s):")
            for line in r['result'][:300].split('\n'):
                print(f"  {line}")

            # Summary
            r = run_test(model, tokenizer, model_name, test, SUMMARY_PROMPT, "summary")
            print(f"\n  SUMMARY ({r['time']:.1f}s):")
            print(f"  {r['result'][:200]}")

        # Free memory
        del model, tokenizer
        print(f"\n{'='*60}")
        print(f"Done with {model_name}")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
