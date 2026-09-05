# 02 — Research: survey of existing game-story tools

Type: research
Status: resolved

## Question

What tools do people already use to write game stories, what do their data models look like, and what minimal feature subset would a "simple" personal app cherry-pick?

Survey at least: Twine, Arcweave, articy:draft, Yarn Spinner (authoring side), Ink/Inky, Scrivener, World Anvil, Campfire, Plottr, and generic boards (Notion/Miro/Trello used for story work). For each:

- What it models (passages/nodes, scenes, characters, variables, boards…)
- What file/data format it stores, and how portable/ownable that is
- What makes it powerful, and what makes it complicated for a beginner

Then synthesize: which ideas are worth stealing for a simple local-first app, and which complexity traps to avoid. This feeds the MVP feature set ([04](04-grilling-mvp-feature-set.md)) and the domain model ([05](05-grilling-domain-model-and-file-format.md)).

Findings file: [research/existing-story-tools.md](../research/existing-story-tools.md)

## Answer

Full survey (10 tools + synthesis + prior-art schemas) in the linked file. Key points:

- Tools split into three families: **branching-node tools** (Twine, Ink, Yarn Spinner, Arcweave, articy:draft), **prose planners** (Scrivener, Plottr, Campfire), and **world-building wikis** (World Anvil). Many solo writers just use Trello/Notion cards — proof that "cards in ordered lists + tags" covers 80% of story planning.
- **Plottr is the closest prior art**: a local-first desktop app whose whole project is one hand-editable JSON `.pltr` file modeling beats (columns) × plotlines (colored rows), with scene cards linked to characters/places/tags.
- **Worth stealing**: one open file per project (Plottr/Twee); card = title + synopsis + body (Scrivener); an ordered beat sequence as the backbone with plotlines as colored lanes (Plottr); reusable Character/Place entities attached to beats by reference (Arcweave components); tags + `key:value` metadata as escape hatches (Twine/Yarn); starter templates; multiple views over one model.
- **Complexity traps to avoid**: variables/conditions/scripting engines (the cliff where every writing tool becomes a programming tool); free-form node graphs (Twine spaghetti — every graph tool grew jumpers/folders to cope); heavyweight template databases (World Anvil's 25+ article types, Campfire's 15 modules); cloud accounts (Arcweave/World Anvil lock-in); compile/export pipelines as a core loop.
- **Recommended minimal model**: five objects — Project, Beat (title/synopsis/body/order/plotline/tags/refs), Plotline, Character, Place (+ Tag) — with an optional `links: beatId[]` field left as a future path to Twine-style branching without a schema change.
