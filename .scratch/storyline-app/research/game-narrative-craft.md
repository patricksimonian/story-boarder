# How Game Story Creation Actually Works — and the Minimal Artifact Set for a Solo Beginner

**Research ticket resolution.** Written 2026-08-25 for a complete beginner to storytelling craft who is building a personal storyline-authoring app. Every term of art is defined where it first appears. This document is self-contained.

---

## 1. What narrative designers and game writers actually produce

First, two job titles you will see everywhere. A **game writer** writes the words — dialogue, cutscene scripts, item descriptions, lore text. A **narrative designer** designs *how* story and gameplay fit together — which quest delivers which revelation, how a branching choice pays off later, how the world itself tells story. In small studios and for hobbyists, one person does both (Wikipedia's "Narrative designer" entry and NarrativeDesigner.com both note the roles blur together in practice).

Professionals do not write a game story as one long manuscript. They produce a *stack of documents at different zoom levels*, from a one-sentence pitch down to individual lines of dialogue. Here is the full menu, each defined in beginner terms. Understanding the zoom-level idea matters more than memorizing the names: each artifact is the same story told at a different resolution, and each one is checked against the level above it.

### Zoom level 1 — the story in miniature

- **Premise / logline.** A one- or two-sentence summary of the whole story: who the protagonist is, what they want, what stands in their way, and what is at stake. Film example shape: "A [flawed hero] must [goal] before [disaster], but [obstacle]." Games use loglines the same way film does — as the sentence everything else must stay true to.
- **Hook / core fantasy.** Game-specific cousins of the logline. The *hook* is the one compelling idea that makes someone want to play; the *core fantasy* is who the player gets to *be* ("you are a smuggler with a talking ship"). Studio pipelines (e.g. Blind Squirrel Entertainment's published narrative pipeline) put these before any plot writing, because in a game the player's role shapes the plot, not the other way around.
- **Synopsis / treatment.** A prose summary of the story from beginning to end, written in present tense like you are telling a friend what happens. A *synopsis* is short (half a page to two pages); a *treatment* is the longer version (several pages) that walks through every major sequence. Screenwriter Scott Myers describes the ladder of summary formats — logline → synopsis → treatment → beat sheet — as progressively more detailed retellings of the same story.

### Zoom level 2 — the story's skeleton

- **Beat sheet.** A numbered list of the story's *beats* — a beat is a single meaningful story event or turning point ("the mentor dies," "the hero learns the villain's identity"). A beat sheet is the skeleton of the plot with no prose, no dialogue, just the ordered events. This is usually the single most useful planning document, in games and film alike.
- **Act structure / outline.** The beats grouped into large movements, most commonly three acts (setup, confrontation, resolution — see §3). An *outline* is just a beat sheet organized under act headings, sometimes with a sentence or two per beat.
- **Scene breakdown.** One step more detailed than the beat sheet: a list of every scene, and for each one, where it happens, who is in it, what changes by the end of it, and what the player/reader learns. In games "scene" can mean a cutscene, a conversation, or a gameplay sequence with story content.

### Zoom level 3 — the reference books ("bibles")

A **bible** in writing jargon is not scripture — it is a reference document that records the facts of your story so you (and any collaborators) stay consistent. Bibles are *living documents*: they grow and change during development.

- **Story bible.** The master reference for the whole narrative: a 2–3 paragraph story summary, the themes and tone, the main characters, major events, key locations and objects, and the rules of the story nobody is allowed to break. Anna Megill (lead writer at Ubisoft Massive, author of *The Game Writing Guide*) describes the story bible's real job as *communication and cohesion* — keeping writing, design, and art telling the same story (via Bryant Francis's Game Developer article "Building a basic story bible for your game"). For a team of one, its job is keeping *you* consistent with yourself six weeks from now.
- **Character bible.** Per-character reference sheets: name, role in the story, what they want (motivation), what is wrong with them (flaw), how they talk (voice), how they change over the story (their *arc*), and their relationships to other characters.
- **World bible / lore document.** The facts of the setting: places, factions, history, technology or magic rules, and how the world works. Big studios grow these to hundreds of pages (Mass Effect's codex, The Witcher's franchise bible) because in a game every NPC, item, and location has to fit the world's rules. A hobbyist needs a few paragraphs, not a tome.

### Zoom level 4 — game-specific structural documents

- **Narrative design document (NDD).** The game-side master doc: how the story is *delivered* through play — which story content lives in which level or quest, how choices work, what the narrative systems are. Think of it as the bridge between the story documents above and the game design.
- **Quest / mission design doc.** For one quest or mission: its goal, its steps, who gives it, what the player does, what can go wrong, and what story payload it carries (what the player learns or how the world changes). RPG-style games are largely written as a pile of these.
- **Branching dialogue flowchart / conversation tree.** A diagram of a conversation where the player chooses lines: boxes for what a character says, arrows to the player's possible responses, and so on down the tree. Tools like Twine, articy:draft, and Yarn Spinner exist specifically to author these; the Game Developer series "Branching Conversation Systems and the Working Writer" is the standard practitioner reference on how to build them without going insane.
- **Screenplay-style script.** For cutscenes and voiced dialogue, games borrow the film screenplay format (scene heading, action lines, character name, dialogue). This is the *last* artifact written, once the structure above is settled.

The professional order of operations, visible in published studio pipelines, is essentially top-down: hook and pillars first, then summary, then structure, then bibles growing alongside, then quest/scene-level docs, then final dialogue. Blind Squirrel's writeup explicitly adds: you might not need every step, and small projects shouldn't produce documents for their own sake.

---

## 2. "Storyboarding" in games vs. film — and why a storyboard is probably not what you want

This distinction matters because the two words *storyboard* and *storyline* get conflated constantly, including by the name of tools and folders (this project's working directory is literally called "storyboarder").

**In film**, a storyboard is a sequence of drawings — like a comic strip — showing shot by shot what the camera will see: framing, character positions, camera moves. It is a *visual pre-production* tool. Crucially, a film storyboard is made *from* an already-written script; it plans the *filming* of a story, it does not invent the story.

**In games**, storyboards are used more narrowly: mostly for *cutscenes* (the non-interactive movie-like sequences between gameplay) and sometimes for planning key gameplay moments — what the player sees, what action they take, what happens next. Because games branch, a game storyboard sometimes has to show choices and alternate outcomes, which drawings handle awkwardly; that is exactly why games developed flowcharts and node-based tools instead.

**The plain-language distinction:** a *storyline* is the sequence of events — *what happens and why*. A *storyboard* is a plan for *how a specific moment will look on screen*. Authoring a storyline is a **writing and structuring** activity, and its natural artifacts are the logline, synopsis, beat sheet, and outline from §1 — words in ordered lists, not pictures in panels. A storyboard only becomes useful late, and only if you are producing visual sequences (cutscenes, comic panels, animatics). If the goal is an app for *authoring storylines*, the beat sheet / outline / bible family is the right center of gravity; drawn storyboards are an optional far-downstream artifact, and for interactive stories the "board" you actually need is a **flowchart of scenes and choices**, not a comic strip.

A useful mental model: **script and beat sheet answer "what happens"; storyboard answers "what does the camera/player see while it happens."** You cannot storyboard a story you have not yet outlined.

---

## 3. Story frameworks and game narrative structures

### 3a. General storytelling frameworks (medium-agnostic)

These are prefab skeletons. None is mandatory; they exist because beginners freeze when facing a blank page, and a framework converts "write a story" into "fill in these labeled slots."

- **Three-act structure.** The oldest and simplest: **Act I (Setup)** introduces the hero and their normal world, then an *inciting incident* knocks that world off balance; **Act II (Confrontation)** is the long messy middle where the hero pursues the goal, pressure builds, and things get worse before they get better; **Act III (Resolution)** is the climax where the hero acts on what the story forced them to learn, followed by the aftermath. Almost every other framework is a more detailed labeling of these three movements.
- **Save the Cat beat sheet.** Blake Snyder's popular screenwriting formula: the three acts subdivided into **15 named beats** (Opening Image, Setup, Catalyst, Debate, Break into Two, B Story, Fun and Games, Midpoint, Bad Guys Close In, All Is Lost, Dark Night of the Soul, Break into Three, Finale, Final Image, plus the "Theme Stated" moment). Its selling point for beginners is that it tames Act II — the part everyone gets lost in — by giving the middle its own named checkpoints. Reedsy and StudioBinder both publish free beginner guides and templates.
- **The Hero's Journey.** Joseph Campbell's (later Christopher Vogler's) circular pattern: an ordinary person is *called to adventure*, refuses, meets a *mentor*, crosses into a special world, faces trials, endures a central *ordeal*, seizes a reward, and returns home transformed. It maps naturally onto games, where the player literally is the hero traveling and leveling up. The frameworks overlap heavily — "Refusal of the Call" in the Hero's Journey is the "Debate" beat in Save the Cat; they are dialects of the same underlying shape.
- **A tip from the guides:** the fastest way to internalize any of these is to take a movie or game you love and write *its* beat sheet — reverse-engineering a known story teaches the framework better than reading about it.

### 3b. Game-specific narrative structures (how the story is arranged for a player)

In a novel or film the audience experiences events in one fixed order. In a game the *player* has agency, so you must also choose a **narrative structure** — the shape of the paths through your story. The standard shapes, one line each:

- **Linear.** One fixed sequence of story events for every player; the player affects moment-to-moment play but not the plot (most classic action games).
- **String of pearls.** The main plot is a linear thread (the string), but between mandatory story moments the player roams freely inside an open chunk (each pearl — side quests, exploration) before the story cinches back to the thread; the dominant structure of big RPGs.
- **Branching.** Player choices split the plot into genuinely different paths and endings; maximal player impact, but content cost explodes combinatorially, which is why pure branching ("time cave" in Sam Ashwell's taxonomy of choice-based structures) is rare beyond short works.
- **Branch and bottleneck.** The practical compromise: paths branch after a choice, then *reconverge* at shared mandatory scenes (bottlenecks), with earlier choices remembered as state (flags, relationship scores) rather than as whole separate plotlines — this is how most commercial "your choices matter" games actually work.
- **Hub and spoke.** A central safe area (the hub) from which the player picks missions or conversation topics in any order, returning to the hub after each spoke; used both for level structure and for dialogue menus ("ask the NPC about any topic, in any order").
- **Open / emergent.** The designer supplies a world, characters, and systems but little fixed plot; story *emerges* from the player's own actions and the simulation (sandbox games, roguelikes). A related authoring technique is **storylets** — small self-contained story pieces with conditions on when they can fire, recombined dynamically rather than arranged in a fixed tree (an approach Emily Short has written about extensively as a more flexible alternative to branching trees).

Two pieces of craft advice for branching stories that recur across practitioner sources (Emily Short's writing-IF resources, the Game Developer branching-conversation series, Choice of Games' design articles): **don't branch early and often** — delay the payoff of choices and reconverge, or the workload buries you; and **use micro-decisions** (small choices of tone or phrasing that don't fork the plot) to give players a feeling of ownership cheaply.

---

## 4. The smallest useful artifact set for a solo hobbyist — and the order to make them in

Professionals produce a dozen document types because dozens of people must coordinate. A solo hobbyist needs only what keeps *one* person oriented and consistent. Synthesizing the professional pipeline (§1), the structure toolkits (§3), and Emily Short's advice to beginners (get a simple outline, then get something playable end-to-end before elaborating), the recommended minimum is **five small artifacts, created in this order**:

1. **Premise (logline) — 1–3 sentences.** Who the protagonist/player is, what they want, what opposes them, what's at stake. For a game, add one sentence of *core fantasy*: what the player gets to be and do. Everything later gets checked against this. *Write it first because it is the cheapest thing to throw away and rewrite until it excites you.*
2. **Character sheets — one short card per major character (protagonist, antagonist, 1–3 others).** Name, role, what they want, their flaw or secret, how they change by the end, how they speak. This is the character bible at hobbyist scale. *Second, because plot is generated by characters wanting incompatible things; you cannot outline events until you know who is pushing.*
3. **World notes — half a page to a page.** Where and when the story happens, the 3–5 facts about the setting that make it different from the real world, and any hard rules (how the magic/tech works, what the factions are). This is the world bible at hobbyist scale. *Keep it short; expand it only when a scene actually needs a new fact.*
4. **Beat sheet / outline — 10–20 ordered beats, grouped into three acts.** One line per beat stating what happens and what changes. Use three-act structure by default; use Save the Cat's 15 beats if the blank page is too frightening; mark the inciting incident, midpoint, low point, and climax. **This is the central artifact — the storyline itself lives here.** *Fourth, because it needs the premise, the characters, and the world to exist first.*
5. **Structure map — only if the story branches.** A simple flowchart of scenes/beats as boxes and choices as arrows, ideally branch-and-bottleneck shaped, with a note of what each choice changes later. For a fully linear story, skip this; the beat sheet already is the map. *Last, because you should know the "canonical" through-line before you fork it — a common professional practice is to write the main path first, then add branches.*

Everything else — treatments, scene-by-scene breakdowns, quest docs, screenplay-format dialogue, and drawn storyboards — is optional elaboration that can be layered on *after* these five exist, and only where the project actually needs it. A hobbyist's first complete pass through artifacts 1–4 can fit on **three or four pages total**, and that is a feature, not a shortcut: short documents get finished, revised, and obeyed; long ones get abandoned.

**Implication for a storyline-authoring app:** the natural data model is exactly these five artifacts — a premise field, a deck of character cards, a world-notes page, an ordered/act-grouped list of beats, and (optionally) a graph view over those beats for branching. The beat is the atomic unit; bibles are the reference layer; the logline is the north star. Drawn storyboards, despite the app's working name, belong far downstream or out of scope.

---

## Sources

Consulted directly:

- Bryant Francis, "Building a basic story bible for your game" (featuring Anna Megill, Ubisoft Massive), Game Developer — https://www.gamedeveloper.com/design/building-a-basic-story-bible-for-your-game
- Blind Squirrel Entertainment, "Narrative Design Series Part 2: Planning & Ideation" — https://blindsquirrelentertainment.com/news/Narrative-Design-Part-2/
- Scott Myers, "Story Summaries: From Loglines to Beat Sheets" — https://scottdistillery.medium.com/story-summaries-from-loglines-to-beat-sheets-f28b054344ab
- Sam Ashwell, "Standard Patterns in Choice-Based Games," These Heterogenous Tasks — https://heterogenoustasks.wordpress.com/2015/01/26/standard-patterns-in-choice-based-games/ (widely-cited taxonomy: time cave, gauntlet, branch-and-bottleneck, quest, open map, sorting hat, floating modules, loop-and-grow)
- Emily Short, "Writing IF" resource hub — https://emshort.blog/how-to-play/writing-if/ ; and "Mailbag: Self-Training in Narrative Design" — https://emshort.blog/2019/01/08/mailbag-self-training-in-narrative-design/
- Game Developer, "Branching Conversation Systems and the Working Writer, Part 2: Design Considerations" — https://www.gamedeveloper.com/design/branching-conversation-systems-and-the-working-writer-part-2-design-considerations ; "Part 3: Building a Conversation Tree" — https://www.gamedeveloper.com/design/branching-conversation-systems-and-the-working-writer-part-3-building-a-conversation-tree
- Reedsy, "Save the Cat Beat Sheet: The Ultimate Guide" — https://reedsy.com/blog/guide/story-structure/save-the-cat-beat-sheet/
- StudioBinder, "Save the Cat Beat Sheet Explained" — https://www.studiobinder.com/blog/save-the-cat-beat-sheet/
- Wikipedia, "Narrative designer" — https://en.wikipedia.org/wiki/Narrative_designer
- NarrativeDesigner.com, "Narrative Design FAQ" — https://narrativedesigner.com/faq.html
- CJ Leo, "Narrative Design: Storytelling Methods in Video Games" — https://cjleo.com/blog/narrative-design-storytelling-methods-in-video-games/
- Katalist, "How to Storyboard a Video Game" — https://www.katalist.ai/how-to-storyboard/video-game
- Polydin, "Game Storyboards: Importance & How to Create Them" — https://polydin.com/game-storyboarding/

Book references behind the advice above (for further reading, not fetched): Anna Megill, *The Game Writing Guide* (2023); Blake Snyder, *Save the Cat!* (2005); Christopher Vogler, *The Writer's Journey*; the IGDA Game Writing SIG's *Professional Techniques for Video Game Writing* (ed. Wendy Despain).
