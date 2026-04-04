"""Test more aggressive stumble prompts on the tricky self-correction case."""
import sys, time, gc
sys.path.insert(0, "/Users/tiurihartog/Skrift_dependencies/mlx-env/lib/python3.10/site-packages")

MODEL_PATH = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-4bit"

BASE = (
    "Clean up this transcript. The author may switch between English and Dutch mid-sentence — this is intentional, keep it exactly as-is.\n\n"
    "Do:\n"
    "- Remove filler words (um, uh, like, you know, so basically, I mean, yeah so).\n"
    "- Fix spelling and grammar.\n"
    "- Add punctuation and paragraph breaks at natural pauses.\n"
    "- Preserve [[double bracket links]] exactly.\n"
)

VARIANTS = {
    "v4_near_identical": BASE + (
        "- When the speaker says nearly the same thing twice in a row (correcting their phrasing), keep only the better version.\n"
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
    "v5_spoken_disfluency": BASE + (
        "- Merge spoken disfluencies: when the speaker repeats a phrase with slight variation (correcting themselves), keep only the corrected version.\n"
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
    "v6_rephrase_collapse": BASE + (
        "- When the speaker immediately rephrases the same thought (e.g. saying a sentence then saying it again slightly differently), collapse into the final version.\n"
        "- Remove false starts and repeated words from thinking out loud.\n"
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
}

TRANSCRIPTS = {
    "self_correction_hendri": (
        "For example, I just thought about how, like so many people, all my friends know so much "
        "cool stuff. How Hendri has all this insight. How Hendri has all these insights. How Bruno "
        "and Gabi can talk in a whole different language and understand different things than I don't."
    ),
    "double_rephrase": (
        "I think the problem is that we're not we're spending too much time on features nobody asked for. "
        "We're spending too much time building features that nobody actually requested. And meanwhile "
        "the core product has bugs that we haven't fixed in months."
    ),
    "mixed_stumbles": (
        "So I was at this conference right and the the keynote speaker was talking about um about "
        "how AI is going to change everything which okay sure everyone says that but then he showed "
        "this demo this really cool demo where he basically he built an entire app in like twenty "
        "minutes and I was like wow dat is that is actually impressive"
    ),
    "clean_control": (
        "Ik was vandaag aan het nadenken over hoe ik mijn tijd besteed en I realized that I spend "
        "way too much time on shallow work, just answering emails and Slack messages."
    ),
}


def run():
    import mlx_lm
    from mlx_lm.sample_utils import make_sampler

    print("Loading Gemma-4-E4B-4bit...")
    model, tokenizer = mlx_lm.load(MODEL_PATH)
    sampler = make_sampler(temp=0.4, top_p=0.95)

    for t_name, transcript in TRANSCRIPTS.items():
        print(f"\n{'='*80}")
        print(f"  {t_name}")
        print(f"{'='*80}")
        print(f"\n  ORIGINAL:")
        _wrap_print(transcript, "  ")

        for v_name, prompt in VARIANTS.items():
            messages = [{"role": "user", "content": f"{prompt}\n\n{transcript}"}]
            formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

            t0 = time.time()
            output = mlx_lm.generate(model, tokenizer, prompt=formatted, max_tokens=512, sampler=sampler)
            elapsed = time.time() - t0

            print(f"\n  ▸ {v_name} ({elapsed:.1f}s):")
            _wrap_print(output.strip(), "    ")

    del model, tokenizer
    gc.collect()


def _wrap_print(text, indent):
    words = text.split()
    line = indent
    for w in words:
        if len(line) + len(w) > 90:
            print(line)
            line = indent
        line += w + " "
    if line.strip():
        print(line)


if __name__ == "__main__":
    run()
