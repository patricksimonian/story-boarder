# 01 — Research: how video game stories are actually created

Type: research
Status: resolved

## Question

How does professional (and hobbyist) video game story creation actually work, and what is the minimal set of artifacts a solo non-expert needs to author a game storyline?

Specifically:

- What do narrative designers / game writers actually produce? (story bible, character bible, world bible, premise/logline, synopsis, beat sheets, act structure, scene breakdowns, quest/mission docs, branching dialogue flowcharts…)
- What does "storyboarding" mean in games vs. film — and is a storyboard even the right artifact for authoring a *storyline*, or is that a different document?
- What beginner-friendly frameworks exist (three-act structure, beat sheets, the "string of pearls" / branching models) and which fit games specifically (linear vs. branching narrative)?
- What is the **smallest useful set** of these artifacts for a solo hobbyist writing their first game story?

The answer educates the user (a beginner) and directly feeds the MVP feature-set decision ([04](04-grilling-mvp-feature-set.md)).

Findings file: [research/game-narrative-craft.md](../research/game-narrative-craft.md)

## Answer

Full findings in the linked file. Key points:

- **Professionals write top-down, at increasing zoom levels**: logline/hook → synopsis/treatment → beat sheet/outline → bibles (story, character, world) → game-specific docs (narrative design doc, quest docs, branching dialogue flowcharts) → final screenplay-format dialogue. Bibles exist for consistency; studio pipelines stress they're living documents and that small projects should skip steps.
- **Storyboard ≠ storyline.** A storyboard plans *what the screen shows* — shot-by-shot drawings made from an already-written script, used in games mainly for cutscenes. A storyline is *what happens and why*, authored in beat sheets and outlines. For interactive stories, the "board" that matters is a scene/choice flowchart, not a comic strip. This directly scopes the app: drawn panels are out; a beat outline (plus maybe a flow view) is in.
- **Frameworks**: three-act structure, Save the Cat's 15 beats, and the Hero's Journey are dialects of the same shape. Game structures: linear, string-of-pearls, branching (time cave), branch-and-bottleneck (the practical industry norm), hub-and-spoke, open/emergent with storylets. Craft consensus: don't branch early, reconverge often, prefer micro-decisions.
- **Recommended minimal artifact set for a solo hobbyist**, in creation order: (1) premise/logline + core fantasy in 1–3 sentences, (2) character cards for 3–5 characters, (3) half a page of world notes, (4) a 10–20-line beat sheet grouped into three acts — this *is* the storyline, (5) an optional branching structure map, added only after the linear through-line works. A first pass fits on 3–4 pages.
- **App implication**: the *beat* is the atomic data unit; premise + character deck + world notes + act-grouped beat list + optional graph view over beats is the natural data model.
