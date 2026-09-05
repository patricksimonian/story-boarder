# 04 — Grilling: which story artifacts does the app actually author?

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Out of everything game-story craft offers (research [01](01-research-game-narrative-craft.md)) and everything existing tools do (research [02](02-research-existing-story-tools.md)), which artifacts does **this** app let the user create in v1?

Decide with the user, one question at a time:

- Is the game's story **linear or branching** — and does v1 need branching at all?
- Which artifacts are in: story overview/premise? characters? locations/world? acts/chapters? scenes/beats? dialogue? a visual board or graph?
- What does a typical writing session look like for the user — what do they open first, what do they edit most?
- What is explicitly a v2-or-later feature?

Output: a short, ranked MVP feature list the domain model ([05](05-grilling-domain-model-and-file-format.md)) and UI work hang off.

## Answer

Decided with Patrick (grilled 2026-08-25, playback confirmed). Frame correction mid-ticket: no beginner-subset scoping — maximum flexibility; "simple" means simple to run and own.

**Structures supported**: linear, string-of-pearls, branch-and-bottleneck, full branching, and open/storylet — the model is branching-capable and storylet-capable from day one.

**Conditions engine — full, declarative** (Patrick chose this over my lighter recommendation; "no shortcuts"):
- Typed variable registry: booleans, numbers, enums — declared project-level so typos can't invent variables.
- Boolean expressions as conditions on storylets *and* branch links (one system for both).
- Effects: declarative assignments applied when a piece fires (`trust += 1`, `mara_alive = false`), including choice outcomes.
- Declarative chance: weight/chance fields on pieces and branches (quality-based-narrative tradition).
- Playthrough simulation: walk the story, make choices, watch live variable state, save named playthroughs as test cases.
- Static analysis: unreachable pieces, dead branches, variables never set, dangling references.
- Boundary: no arbitrary scripting (loops/functions); conditions and effects remain declarative data in the user's files.

**Artifacts**: premise, synopsis, acts, beats, plotlines, characters, locations, world/lore docs, tags + cross-links everywhere, dialogue as prose inside beats, and a first-class **unplaced idea pool** (pieces can live fully-written outside any structure, forever if desired).

**UI**: board as home base (acts × plotlines, pool docked), graph view as co-equal tab over the same pieces, one-click distraction-free prose editor from either, character/world library as sidebar.

**Also in v1** (Patrick pulled my entire proposed cut list back in): image attachments and mood boards on any piece; built-in sketch canvas for rough storyboard panels (not a full art suite); full-text search; optional starter templates (three-act, branch-and-bottleneck, storylet pool — scaffolding, never enforced); import from Twine and Plottr; **playable standalone-HTML export** (Twine-style single file, runs the conditions engine); word-count goals and writing stats.

**Out (effort-wide, per map)**: cloud/accounts/collaboration; game-engine export formats (Unity/Unreal/Godot, Ink/Yarn runtime files).

Consequence noted at confirmation: this is Plottr-meets-Twine scale, so build *staging order* becomes a real decision downstream.
