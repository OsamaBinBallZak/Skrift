"""Test refined Skrift prompts on Gemma-4-E4B."""
import sys, time, gc
sys.path.insert(0, "/Users/tiurihartog/Skrift_dependencies/mlx-env/lib/python3.10/site-packages")

MODEL_PATH = "/Users/tiurihartog/Skrift_dependencies/models/mlx/gemma-4-e4b-it-4bit"

# ── Refined prompts ──────────────────────────────────────────────────

COPY_EDIT = (
    "Clean up this transcript. The author may switch between English and Dutch mid-sentence — this is intentional, keep it exactly as-is.\n\n"
    "Do:\n"
    "- Remove filler words (um, uh, like, you know, so basically, I mean, yeah so).\n"
    "- Fix spelling and grammar.\n"
    "- Add punctuation and paragraph breaks at natural pauses.\n"
    "- Preserve [[double bracket links]] exactly.\n\n"
    "Do not:\n"
    "- Rephrase, rewrite, or restructure sentences.\n"
    "- Translate anything between languages.\n"
    "- Add formality — it should still sound like the person speaking.\n"
    "- Add any preamble, heading, or explanation.\n\n"
    "Output only the cleaned text."
)

TITLE = (
    "Generate a short, descriptive title for this text (5–15 words). "
    "If the speaker explicitly names the topic, use their words. "
    "Match the primary language of the text. "
    "Return ONLY the title, nothing else."
)

SUMMARY = (
    "Summarize this in 1–3 sentences (30–60 words). "
    "Capture the main point and any decision or action item. "
    "If there are multiple topics, mention each briefly. "
    "Write in third person. Match the primary language of the text. "
    "Output only the summary."
)

IMPORTANCE = (
    "Rate the personal significance of this text from 0.0 to 1.0.\n"
    "High (0.7–1.0): life decisions, personal realizations, meaningful experiences, important plans, relationship insights.\n"
    "Medium (0.3–0.7): useful ideas, project updates, learning notes, opinions.\n"
    "Low (0.0–0.3): routine tasks, weather, small talk, logistics.\n"
    "Return ONLY a number between 0.0 and 1.0."
)

PROMPTS = {
    "copy_edit": COPY_EDIT,
    "title": TITLE,
    "summary": SUMMARY,
    "importance": IMPORTANCE,
}

# ── Test transcripts ─────────────────────────────────────────────────

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
    "dutch_personal": (
        "Ik had gisteren een goed gesprek met um mijn broer en hij zei dat hij eigenlijk al een "
        "tijdje nadenkt over om een eigen bedrijf te starten en ik was echt like verbaasd want hij "
        "heeft het er nooit over gehad en hij wil iets doen met sustainable fashion of zoiets en "
        "ik denk dat het echt goed bij hem past want hij is altijd al bezig geweest met dat soort "
        "dingen en ik heb gezegd dat ik hem wil helpen met de website en het technische gedeelte "
        "dus we gaan volgende week even samen zitten om te brainstormen"
    ),
    "mixed_meeting_notes": (
        "Okay so the standup today was eigenlijk best nuttig for once um [[David]] mentioned that "
        "the CI pipeline is breaking on the staging branch iets met de Docker image die te groot is "
        "geworden and he needs help from someone who knows Kubernetes better so I said ik kijk er "
        "vandaag nog naar and also [[Anna]] brought up that the client demo is moved to Thursday "
        "instead of Friday so we have one less day to polish the UI which is a bit stressful maar "
        "ik denk dat we het redden als we vandaag en morgen focussen"
    ),
}


def run():
    import mlx_lm
    from mlx_lm.sample_utils import make_sampler

    print("Loading Gemma-4-E4B-4bit...")
    model, tokenizer = mlx_lm.load(MODEL_PATH)
    sampler = make_sampler(temp=0.7, top_p=0.95)

    for transcript_name, transcript in TRANSCRIPTS.items():
        print(f"\n{'='*80}")
        print(f"  {transcript_name}")
        print(f"{'='*80}")
        print(f"\n  ORIGINAL:")
        # Wrap original nicely
        words = transcript.split()
        line = "  "
        for w in words:
            if len(line) + len(w) > 90:
                print(line)
                line = "  "
            line += w + " "
        if line.strip():
            print(line)

        for task_name, prompt in PROMPTS.items():
            messages = [{"role": "user", "content": f"{prompt}\n\n{transcript}"}]
            formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

            max_tokens = 512
            if task_name == "title":
                max_tokens = 64
            elif task_name == "importance":
                max_tokens = 16

            t0 = time.time()
            output = mlx_lm.generate(model, tokenizer, prompt=formatted, max_tokens=max_tokens, sampler=sampler)
            elapsed = time.time() - t0

            print(f"\n  ▸ {task_name} ({elapsed:.1f}s):")
            text = output.strip()
            # Wrap output
            words = text.split()
            line = "    "
            for w in words:
                if len(line) + len(w) > 90:
                    print(line)
                    line = "    "
                line += w + " "
            if line.strip():
                print(line)

    del model, tokenizer
    gc.collect()


if __name__ == "__main__":
    run()
