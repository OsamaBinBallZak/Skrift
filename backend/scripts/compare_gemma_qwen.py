"""Compare Gemma-4-E4B vs Qwen3.5-9B on Skrift enhancement tasks."""
import sys, time, gc

MODELS = {
    "Gemma-4-E4B-4bit": {
        "path": "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-4bit",
        "chat_template": None,  # use model's built-in
    },
    "Qwen3.5-9B-4bit": {
        "path": "/Users/tiurihartog/Skrift_dependencies/models/mlx/Qwen3.5-9B-MLX-4bit",
        "chat_template": "/Users/tiurihartog/Skrift_dependencies/models/mlx/Qwen3.5-9B-MLX-4bit/chat_template_nothink.jinja",
    },
}

# --- Fake voice memo transcripts (realistic Skrift input) ---

TRANSCRIPTS = {
    "voice_memo_rambling": (
        "So um yeah I was thinking about this like I had this conversation with [[Sarah]] yesterday "
        "and she was saying that um you know the project deadline is actually moved to next Friday "
        "which is like a week earlier than we thought so basically we need to like reorganize the "
        "whole sprint and I mean I think the frontend stuff is mostly done but the API integration "
        "with the payment provider is still you know it's still not working properly because of "
        "that authentication bug that [[Marco]] found last week and uh I think we should probably "
        "just like focus all our efforts on that this week and maybe push the dashboard redesign "
        "to the next sprint because honestly it's not that critical right now"
    ),
    "bilingual_reflection": (
        "Ik was vandaag aan het nadenken over hoe ik mijn tijd besteed en I realized that I spend "
        "way too much time on like shallow work you know just answering emails and Slack messages "
        "en eigenlijk kom ik nooit toe aan de dingen die echt belangrijk zijn like deep focused work "
        "on the product roadmap of het schrijven van die blog posts die ik al maanden wil doen "
        "so I think I'm going to try this thing where I block the first three hours of every morning "
        "for deep work geen meetings geen Slack gewoon focused werken en dan na lunch kan ik al die "
        "andere dingen doen we'll see hoe dat gaat"
    ),
    "quick_idea": (
        "Oh quick thought I just had um for the onboarding flow what if we added a short video "
        "tutorial like 30 seconds max that shows the three main features instead of that wall of "
        "text nobody reads anyway [[Lisa]] mentioned something similar in the design review last "
        "month and I think she's right it would probably cut our drop-off rate in half"
    ),
}

TASKS = {
    "title": (
        "Analyze the following transcript. "
        "If the speaker explicitly mentions a title or name for this content, extract and return that exact title. "
        "If no title is mentioned, generate an appropriate, descriptive title (10 - 30 words) that captures the main topic. "
        "Return ONLY the title itself, nothing else."
    ),
    "copy_edit": (
        "You are editing text into clean, polished written form. The text may be a transcribed voice memo or a written note. "
        "The author may mix English and Dutch — preserve their language choices, do not translate.\n\n"
        "Rules:\n"
        "- Remove filler words (um, uh, like, you know, so basically, I mean) if present.\n"
        "- Break run-on sentences into clear, shorter ones.\n"
        "- Organize loose or stream-of-consciousness text into logical paragraphs.\n"
        "- Fix grammar and spelling.\n"
        "- Preserve any occurrences of [[like this]] exactly as-is. Do not remove the double brackets or alter the inner text.\n"
        "- Preserve the author's natural tone and all substantive content.\n"
        "- Do not add explanations, headings, or preambles.\n"
        "- Output only the edited text, nothing else."
    ),
    "summary": (
        "Summarize this text in 1-3 concise sentences (30-60 words). Capture the key insight or realization, "
        "plus any concrete action item or decision. If the text covers multiple distinct topics, mention each briefly. "
        "Write in third person. Output only the summary, nothing else."
    ),
}

def run_test():
    import mlx_lm

    results = {}

    for model_name, model_info in MODELS.items():
        model_path = model_info["path"]
        custom_template_path = model_info.get("chat_template")

        print(f"\n{'='*70}")
        print(f"  LOADING: {model_name}")
        print(f"{'='*70}")

        t0 = time.time()
        model, tokenizer = mlx_lm.load(model_path)
        load_time = time.time() - t0
        print(f"  Loaded in {load_time:.1f}s")

        # Apply custom chat template if specified
        if custom_template_path:
            with open(custom_template_path) as f:
                tokenizer.chat_template = f.read()
            print(f"  Applied custom chat template (thinking disabled)")

        results[model_name] = {"load_time": load_time, "outputs": {}}

        for transcript_name, transcript in TRANSCRIPTS.items():
            results[model_name]["outputs"][transcript_name] = {}

            for task_name, prompt in TASKS.items():
                print(f"\n  --- {transcript_name} / {task_name} ---")

                if hasattr(tokenizer, 'apply_chat_template'):
                    messages = [
                        {"role": "user", "content": f"{prompt}\n\n{transcript}"}
                    ]
                    formatted = tokenizer.apply_chat_template(
                        messages, tokenize=False, add_generation_prompt=True
                    )
                else:
                    formatted = f"{prompt}\n\n{transcript}"

                max_tokens = 512 if task_name != "title" else 64

                from mlx_lm.sample_utils import make_sampler
                sampler = make_sampler(temp=0.7, top_p=0.95)

                t0 = time.time()
                output = mlx_lm.generate(
                    model, tokenizer, prompt=formatted,
                    max_tokens=max_tokens, sampler=sampler,
                )
                gen_time = time.time() - t0

                # Count output tokens roughly
                out_tokens = len(tokenizer.encode(output))
                tps = out_tokens / gen_time if gen_time > 0 else 0

                results[model_name]["outputs"][transcript_name][task_name] = {
                    "text": output.strip(),
                    "time": gen_time,
                    "tokens": out_tokens,
                    "tps": tps,
                }
                print(f"  ({gen_time:.1f}s, {out_tokens} tok, {tps:.1f} tok/s)")
                # Print first 200 chars
                preview = output.strip()[:200]
                print(f"  > {preview}")

        # Unload
        del model, tokenizer
        gc.collect()
        print(f"\n  Unloaded {model_name}")

    # --- Final comparison ---
    print(f"\n\n{'='*70}")
    print("  COMPARISON")
    print(f"{'='*70}")

    for model_name, data in results.items():
        print(f"\n## {model_name} (loaded in {data['load_time']:.1f}s)")

    for transcript_name in TRANSCRIPTS:
        for task_name in TASKS:
            print(f"\n{'─'*70}")
            print(f"  [{transcript_name}] → {task_name}")
            print(f"{'─'*70}")
            for model_name in MODELS.keys():
                entry = results[model_name]["outputs"][transcript_name][task_name]
                print(f"\n  ▸ {model_name} ({entry['time']:.1f}s, {entry['tps']:.1f} tok/s):")
                print(f"    {entry['text'][:500]}")
                if len(entry['text']) > 500:
                    print(f"    [...{len(entry['text'])-500} more chars]")

    # Speed summary
    print(f"\n{'─'*70}")
    print("  SPEED SUMMARY")
    print(f"{'─'*70}")
    for model_name in MODELS.keys():
        all_tps = [
            results[model_name]["outputs"][t][task]["tps"]
            for t in TRANSCRIPTS for task in TASKS
        ]
        avg_tps = sum(all_tps) / len(all_tps)
        load = results[model_name]["load_time"]
        print(f"  {model_name}: avg {avg_tps:.1f} tok/s, load {load:.1f}s")


if __name__ == "__main__":
    sys.path.insert(0, "/Users/tiurihartog/Skrift_dependencies/mlx-env/lib/python3.10/site-packages")
    run_test()
