"""Test Gemma-4-E4B with different copy_edit prompts to find one that stays closer to original text."""
import sys, time, gc
sys.path.insert(0, "/Users/tiurihartog/Skrift_dependencies/mlx-env/lib/python3.10/site-packages")

MODEL_PATH = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-4bit"

PROMPTS = {
    "current": (
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
    "light_touch": (
        "Lightly clean up this transcribed voice memo or note. The author may mix English and Dutch.\n\n"
        "Do:\n"
        "- Remove filler words (um, uh, like, you know, so basically, I mean).\n"
        "- Fix obvious grammar and spelling errors.\n"
        "- Add punctuation and paragraph breaks where natural pauses occur.\n"
        "- Preserve [[double bracket links]] exactly as-is.\n\n"
        "Do NOT:\n"
        "- Rephrase or rewrite sentences. Keep the author's exact words.\n"
        "- Translate between languages. If they switch from Dutch to English mid-sentence, keep it.\n"
        "- Change the structure or order of ideas.\n"
        "- Add formality or polish. This should still sound like the person talking.\n"
        "- Add explanations, headings, or preambles.\n\n"
        "Output only the cleaned text, nothing else."
    ),
    "minimal": (
        "Clean up this transcript. Remove filler words (um, uh, like, you know, basically, I mean), "
        "fix spelling, add punctuation. Keep everything else exactly as the speaker said it — same words, "
        "same language (English, Dutch, or mixed), same sentence structure. "
        "Preserve [[bracket links]] as-is. Output only the cleaned text."
    ),
}

TRANSCRIPTS = {
    "bilingual_reflection": (
        "Ik was vandaag aan het nadenken over hoe ik mijn tijd besteed en I realized that I spend "
        "way too much time on like shallow work you know just answering emails and Slack messages "
        "en eigenlijk kom ik nooit toe aan de dingen die echt belangrijk zijn like deep focused work "
        "on the product roadmap of het schrijven van die blog posts die ik al maanden wil doen "
        "so I think I'm going to try this thing where I block the first three hours of every morning "
        "for deep work geen meetings geen Slack gewoon focused werken en dan na lunch kan ik al die "
        "andere dingen doen we'll see hoe dat gaat"
    ),
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
    "quick_idea": (
        "Oh quick thought I just had um for the onboarding flow what if we added a short video "
        "tutorial like 30 seconds max that shows the three main features instead of that wall of "
        "text nobody reads anyway [[Lisa]] mentioned something similar in the design review last "
        "month and I think she's right it would probably cut our drop-off rate in half"
    ),
}


def run():
    import mlx_lm
    from mlx_lm.sample_utils import make_sampler

    print(f"Loading Gemma-4-E4B-4bit...")
    model, tokenizer = mlx_lm.load(MODEL_PATH)
    sampler = make_sampler(temp=0.7, top_p=0.95)

    for transcript_name, transcript in TRANSCRIPTS.items():
        print(f"\n{'='*80}")
        print(f"  TRANSCRIPT: {transcript_name}")
        print(f"{'='*80}")
        print(f"  ORIGINAL:\n  {transcript[:300]}...")

        for prompt_name, prompt in PROMPTS.items():
            messages = [{"role": "user", "content": f"{prompt}\n\n{transcript}"}]
            formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

            t0 = time.time()
            output = mlx_lm.generate(model, tokenizer, prompt=formatted, max_tokens=512, sampler=sampler)
            elapsed = time.time() - t0

            print(f"\n  --- {prompt_name} ({elapsed:.1f}s) ---")
            print(f"  {output.strip()}")

    del model, tokenizer
    gc.collect()


if __name__ == "__main__":
    run()
