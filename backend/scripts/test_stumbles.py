"""Test copy_edit prompt variations for handling voice stumbles."""
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
    "current": BASE + (
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
    "v1_merge_corrections": BASE + (
        "- When the speaker repeats or corrects themselves, keep only the final version.\n"
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
    "v2_stumbles": BASE + (
        "- Clean up speech stumbles: false starts, self-corrections, and repeated phrases where the speaker is finding their words.\n"
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
    "v3_both": BASE + (
        "- When the speaker restarts or corrects a phrase, keep only the final version.\n"
        "- Clean up false starts and repeated fragments from thinking out loud.\n"
        "\nDo not:\n"
        "- Rephrase, rewrite, or restructure sentences.\n"
        "- Translate anything between languages.\n"
        "- Add formality — it should still sound like the person speaking.\n"
        "- Add any preamble, heading, or explanation.\n\n"
        "Output only the cleaned text."
    ),
}

TRANSCRIPTS = {
    "self_correction": (
        "For example, I just thought about how, like so many people, all my friends know so much "
        "cool stuff. How Hendri has all this insight. How Hendri has all these insights. How Bruno "
        "and Gabi can talk in a whole different language and understand different things than I don't."
    ),
    "false_starts": (
        "I was going to I was thinking maybe we should um we should probably redesign the "
        "the landing page because it's it's really not converting well and [[Sarah]] said "
        "she had some ideas about that"
    ),
    "rambling_restarts": (
        "Het punt is eigenlijk dat we we moeten we moeten echt beter communiceren want ik had "
        "gisteren een meeting met [[Tom]] en hij wist niet hij had geen idee dat we al begonnen "
        "waren met de migratieplannen en dat is dat is gewoon niet oké"
    ),
    "mixed_stumbles": (
        "So I was at this conference right and the the keynote speaker was talking about um about "
        "how AI is going to change everything which okay sure everyone says that but then he showed "
        "this demo this really cool demo where he basically he built an entire app in like twenty "
        "minutes and I was like wow dat is that is actually impressive"
    ),
    # Control: clean text that should NOT be changed much
    "clean_bilingual": (
        "Ik was vandaag aan het nadenken over hoe ik mijn tijd besteed en I realized that I spend "
        "way too much time on shallow work, just answering emails and Slack messages. En eigenlijk "
        "kom ik nooit toe aan de dingen die echt belangrijk zijn."
    ),
}


def run():
    import mlx_lm
    from mlx_lm.sample_utils import make_sampler

    print("Loading Gemma-4-E4B-4bit...")
    model, tokenizer = mlx_lm.load(MODEL_PATH)
    sampler = make_sampler(temp=0.4, top_p=0.95)  # lower temp for more consistent comparison

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
