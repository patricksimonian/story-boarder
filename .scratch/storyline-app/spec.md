# Storyline App — Build Spec

This is the whole plan in one place, pulled from the decisions we made across tickets [04](issues/04-grilling-mvp-feature-set.md) through [09](issues/09-grilling-versioning-and-backup.md) and the four research files. The tickets remain the record — if this document ever disagrees with one, the ticket wins and the spec gets fixed.

## What we're building

A local-first web app you run on your own machine to write your game's story: the structure, the prose, the characters and world, and a declarative conditions engine underneath it all. Everything you write lives as plain files in a folder you choose. Not a database, not a cloud account — files you could open in Notepad, move to another machine, or read in thirty years.

Three principles decided everything downstream. First, *simple means simple to run and own*, never a simplified authoring model — the app supports linear stories, branching, storylets, and everything between from day one. Second, you own the content: portable files, no lock-in, and disk is always the source of truth, even over what the app has in memory. Third, the vocabulary is fixed — the glossary in [/CONTEXT.md](../../CONTEXT.md) is binding for UI labels, file fields, and code names. The home view is called *Storylines* because that's the word; scenes are scenes, never "cards" or "nodes."

The target is Windows 11, in Edge or Chrome. Out of scope for this whole effort: vendor clouds, accounts, and collaboration (syncing to a GitHub remote *you* own is in — that's portable and ownable, unlike someone else's cloud), game-engine export, and the game itself.

## The domain model

A **scene** is the atomic unit — an encapsulated stretch of story holding a synopsis, an ordered list of **beats** (the smallest units of story change), prose with dialogue, and attachments. The load-bearing idea, settled in [05](issues/05-grilling-domain-model-and-file-format.md): *placement is an attachment, never a type change*. A scene can sit in storylines, branch to other scenes through choices, carry conditions and effects, or float loose in the idea pool — and moving between those states never transforms it into a different kind of thing. A loose scene carrying a condition is a *storylet*, which is a usage pattern, not a type.

A **storyline** is an ordered sequence of scenes — the main storyline plus any number of secondary arcs. A scene can belong to several storylines at once, and all its memberships are equal: the prototype work ([08](issues/08-prototype-board-and-editor.md)) established that there's no "home lane," so the order of a scene's `storylines` list carries no meaning beyond file order. **Acts** are time-groupings shared across storylines so the lanes stay aligned. A scene can sit in a storyline before it has an act — the board and Overview show those in a leading "No act yet" column, which appears only while it has scenes and takes drops both ways: a card dragged into it keeps its lane and loses its act (amended 2026-09-04, when act-less lane scenes turned out to render nowhere at all). The **idea pool** is where scenes live when they belong to no storyline — fully written, tagged, linked, and unplaced, forever if you like. Characters, places, and lore docs are reference entities, linked from scenes and beats by slug.

The engine attaches at one altitude only: conditions, effects, chance, and choices belong to *scenes*, never beats. A mid-scene choice means the scene splits there — a choice structurally ends a scene. An effect may cite a beat as its narrative anchor for bookkeeping, but evaluation stays scene-level.

## What's on disk

The story folder identifies itself with a `story.json`; any folder containing a valid one opens.

```
MyStory/
├── story.json          ← manifest: title, acts, storylines (names/colors/glyphs/scene order), settings
├── scenes/<slug>.md    ← YAML frontmatter (id, storylines, act, tags, characters,
│                          condition, effects, choices) + body: ## Synopsis / ## Beats / ## Prose
├── characters/<slug>.md
├── places/<slug>.md
├── lore/<slug>.md
├── variables.json      ← typed variable registry
├── playthroughs/<name>.json
└── assets/             ← images; sketches saved as PNG/SVG
```

A few rules here carry weight. Every prose entity gets its own file, which keeps things git-friendly and human-readable. Order lives in `story.json`, never in filenames, so reordering scenes never renames files. Ids are slugs, stable after creation — renaming a scene changes its display title and nothing else. Conditions and effects are written in the files as readable strings (`trust >= 3 and not mara_dead`) and parsed at load into a typed AST; only variables declared in the registry exist, so a typo can't silently invent one. And each storyline in the manifest carries a name, a color, *and* a glyph — identity never rides on color alone, and the glyph is yours to choose (the prototype's ◆ ● ▲ are placeholders).

The app treats the folder as live territory, not private property. It watches for changes and reloads external edits as they happen — write in the app, or in Notepad, or let another tool touch the files, and the app follows. There's exactly one conflict case: a file changed on disk while the same file has unsaved edits in the app. That opens a side-by-side view where you pick or merge; nothing gets clobbered silently in either direction. Malformed files are flagged and editable raw in the app, never dropped or "helpfully" repaired.

## Platform and architecture

The app is a hosted static PWA, installed from Edge or Chrome ([06](issues/06-grilling-platform-and-stack.md)). Hosting the static code publicly is fine because your content never touches the host — the app reaches your story folder through the File System Access API, and an installed PWA keeps that permission across sessions. Change detection uses FileSystemObserver where the browser has it, with a polling fallback.

The stack is TypeScript, React, and Vite, with React Flow for the graph view and TipTap for the prose editor. File access, git, and folder-watching each sit behind a thin adapter interface. That's the Tauri hedge: if we ever want a real desktop shell — native git, the OS credential store, native file watching — we wrap the same codebase rather than rewrite it.

Sync works like this: the story folder is a real git repository and the app is also a git client. Browsers can't speak git protocol to github.com directly, and routing your writing through some public CORS proxy was never acceptable, so sync goes through the GitHub REST API — real commits, real history, authenticated by a fine-grained PAT you paste once. The token lives in app-local storage, never in the story folder. Writes to disk are instant and local; sync happens in the background and never blocks writing.

## Never losing writing

This is the app's core promise, and it has three layers ([09](issues/09-grilling-versioning-and-backup.md)).

The first layer is a scratch journal: every keystroke lands in a browser-local write-ahead journal (IndexedDB) within milliseconds. If the app launches and finds the journal ahead of disk — a crash, a power cut — it reconciles: automatically when the disk file hasn't been touched since journaling, side-by-side when it has. The journal clears only after a confirmed disk write. You never see this layer; it's plumbing.

The second layer is disk auto-save, about a second after typing pauses, always as an atomic write — temp file, then rename — so a power cut can't half-corrupt a file.

The third layer is git. The app commits at natural boundaries — closing or switching a scene, or a few minutes of idle — with generated messages that actually describe the change ("Edit scene: The Dry Cistern — prose +240 words, 2 beats added"). A manual **checkpoint** action commits any time with your own message. Commits work fully offline through embedded JS git; when you're online, each commit pushes automatically, and after an offline stretch the app catches up. If the remote is ahead (you wrote on another machine), the app pulls first, and any overlap surfaces in the same side-by-side view as everything else. The remote is never force-pushed. Per-scene history — view and restore any prior version — lives in the app; browsing the whole repo is what GitHub's own UI is for.

## The conditions engine

The engine is full and declarative — no scripting, no loops, no functions. Conditions and effects stay data in your files, which is what keeps them portable and analyzable.

The registry (`variables.json`) declares typed variables: booleans, numbers, enums. Conditions are boolean expressions over those variables, and one expression system gates both scenes (including storylets) and choices. Effects are declarative assignments (`trust += 1`, `mara_alive = false`) applied when a scene fires or a choice is taken. Chance puts declarative weights on choices and loose scenes, in the quality-based-narrative tradition. Choices are directed scene-to-scene links the player or the simulation takes — optionally gated, effect-carrying, weighted.

Expression strings parse into a typed AST that a small, eval-free interpreter runs — safe under CSP and from `file://`, which matters because the same interpreter powers both the in-app simulation and the playable export. Simulation means walking the story, making choices, watching variable state change live, and saving named playthroughs as test cases. Static analysis rounds it out: unreachable scenes, dead branches, variables never set, dangling references.

## The UI

The prototype ([08](issues/08-prototype-board-and-editor.md), approved at v4.1) settled this, and the prototype file itself is the visual reference. The design is one board seen at different zoom levels, not a set of separate views.

**Storylines** is home: subway-style horizontal lanes, one per storyline, each labeled with its glyph, color, and name. Scenes sit as compact nodes on the lines, act boundaries cross as labeled dashed rules, and the mouse wheel over the lanes scrolls down through the storylines as any page would, while the wheel over the minimap scrolls the story sideways (←/→ jumps act to act; changed 2026-08-28 from wheel-scrolls-sideways after the first hands-on pass, where a nine-storyline board put the lower lanes out of reach). A scene in several storylines gets a full, equal card in *every* member lane at the same column, joined by a vertical connector line that runs card to card — the line expresses the relationship, the cards keep their lanes, and it works whether the lanes are adjacent or three lanes apart.

Zoom out and you get **Overview**, a compact acts-by-storylines grid with title-only cards. Zoom into an act (the ⤢ on any act header) and you get that act alone, with prose-forward cards grouped by storyline and ‹/› stepping between acts. Click any card anywhere and the **editor** slides over: distraction-free title, engine block, synopsis, beats, and TipTap prose. Esc always walks up one level — editor, act, Storylines — and view state lives in the URL.

The **minimap** docks at the bottom of the Storylines view: the whole story in miniature at a fixed ~24px pitch, only as wide as the story needs, with a live viewport rectangle you can drag, act labels you can click to jump, a per-row storyline legend, and scene titles on hover.

Navigation is a left sidebar — story title, the views, an acts list, the storyline legend, the idea-pool toggle, and the reference library for characters, places, and lore. The idea pool opens as a right-hand drawer, the same in every view.

The **graph view** is a co-equal tab over the same scenes, built on React Flow: scenes as nodes, choices as edges, conditions and chance shown on the edges. It wasn't part of the prototype; it follows the board's idioms (glyphs, colors, same drill-in), and if layout questions surface during its build stage, we prototype then.

Everywhere a scene appears as a card, it carries its title, its storyline glyphs, and engine badges — ⚑ condition, Δ effects, ◔ chance, ⑂ choices, ≡ beats — sized to the zoom level.

## Import and export

Research [07](research/interchange-formats.md) mapped both formats and the export pattern.

Twine imports through both of its surfaces: Twee 3 text (the `:: Name [tags]` headers, plus the `StoryTitle`/`StoryData` special passages with their uppercase-UUID `ifid`) and published or archived HTML (a `<tw-storydata>` island, parsed with a DOM parser). Titles, passages, tags, positions, and the `[[link]]` graph import universally — passages become scenes, links become choices. Harlowe and SugarCube macros are story-format-specific, so their bodies import as prose with the raw source preserved verbatim, and the app offers best-effort lifting of `if`/`set` into conditions and effects as suggestions only, never silent conversion.

Plottr's `.pltr` is one JSON file — a serialized Redux store. The importer branches on `file.version`, tolerates unknown keys (Plottr's recent development is closed-source), knows that beats became a per-book tree in 2021.4.13, that rich text is Slate node arrays rather than strings, and that `beat.title: "auto"` is a sentinel. Plottr has no branching or variables, so an import seeds structure and prose: lines become storylines, beats and cards become acts and scenes, characters, places, and tags become reference entities.

The playable export copies Twine's compile model: a `player-template.html` with `{{STORY_NAME}}`, `{{STORY_JSON}}`, and `{{RUNTIME_JS}}` markers, a once-bundled minified runtime that embeds the same eval-free interpreter the simulator uses, and the story as JSON in a `<script type="application/json">` island with `<` escaped. Every export also embeds a second, inert copy of the authoring JSON, so an exported file is losslessly re-importable. The exported file must run from `file://`, because that's how people will open it.

## The rest of v1

The flexibility features, all confirmed in scope by [04](issues/04-grilling-mvp-feature-set.md): image attachments and mood boards on any scene or reference entity (files land in `assets/`); a built-in sketch canvas for rough storyboard panels, saved as PNG or SVG — a sketchpad, not an art suite; full-text search across all files; optional starter templates (three-act, branch-and-bottleneck, storylet pool) that scaffold and never enforce; and word-count goals with writing stats.

## How the build is staged

The scope is Plottr-meets-Twine scale, so what lands first matters. This is the order from ticket [10](issues/10-task-assemble-spec-and-build-plan.md), pressure-tested: the skeleton held, with the never-lose-writing layers pulled forward into stage 2 — they're the core promise and can't wait for the git stage — and a stage 0 added for bootstrap. Each stage is its own `/tdd` effort and ends with something you can actually use.

**Stage 0 — Bootstrap.** Init the repo, commit the prototype to its throwaway branch (`prototype/08-board-and-editor`) and repoint issue 08's asset link, scaffold Vite + TS + React, define the adapter interfaces, and wire up the domain types. Done when `pnpm dev` serves an empty shell with a typed domain model and stubbed adapters.

**Stage 1 — Core model, file I/O, and the board.** Folder picker and recents, loading and validating a story folder, malformed-file flagging with raw editing, folder watching with live reload and the side-by-side conflict view, plus the Storylines home (lanes, bridges, minimap), Overview, act zoom, and sidebar — with enough write support to create scenes, acts, and storylines atomically. Done when you can open a real folder, browse every zoom level, add a scene, then edit a file in Notepad and watch the app follow.

**Stage 2 — The editor and the safety layers.** The slide-over editor with synopsis, beats, and TipTap prose; the IndexedDB keystroke journal with launch reconciliation; debounced atomic auto-save. Done when you can kill the browser mid-sentence, relaunch, and have lost nothing — and a power cut during a save can't corrupt a file.

**Stage 3 — Structure and the graph.** Managing storylines and acts (create, rename, color, glyph, reorder), dragging scenes between lanes, acts, and the pool, editing multi-storyline membership, deleting scenes (added 2026-08-28 — the original list never named it; the file goes, every manifest order drops the slug, and choices that pointed at it get flagged rather than silently cut), and the graph view tab. Done when the full Embers-scale structure can be built from an empty folder without touching a file by hand. (Built 2026-08-29. Taken literally, that meant the start screen had to offer to start a story in a folder with no story.json, so it does — the manifest is written titled after the folder. The graph's layout derives from the board rather than being saved; see the map's ticket-10 line for the rest of the decisions.)

**Stage 4 — The engine.** The registry UI, the expression parser and AST, editing conditions, effects, chance, and choices on scenes, the playthrough simulator with live state and saved playthroughs, and the static analysis panel. Done when a branching story simulates end to end and analysis reports everything it should. (Built 2026-08-29. The grammar is documented at the top of `src/engine/expr.ts`; the simulator's exits rule and the analysis's one sound can-never test are on the map's ticket-10 line.)

**Stage 5 — History and sync.** Embedded git behind the adapter, boundary commits with generated messages, checkpoints, per-scene history with restore, and GitHub REST sync — PAT setup, auto-push, pull-first, an offline queue, and never a force-push. Done when a two-machine round trip works, including an offline stretch and an overlap resolved side by side.

**Stage 6 — Interchange.** Twine import across both surfaces with macro preservation and suggestions, version-branched Plottr import, and the playable HTML export with its re-import island. Done when a SugarCube sample and a `.pltr` sample import cleanly and an export plays from `file://` and re-imports losslessly.

**Stage 7 — Flexibility.** Images and mood boards, the sketch canvas, search, templates, goals and stats. Done when each works on any scene or reference entity. (Built 2026-09-02. The deferred reference-library panel opened the stage — the notebook's explorer shape with three fixed shelves, pages on the same safety rails — because "any reference entity" needs a panel to open one in. The stage's deferred decisions settled as: search runs with no index at all, since the loaded story is already every file in memory; sketches are strokes on an inline SVG saved as a standalone `.svg` — no canvas API anywhere — pinned to the mood board through the same door as an uploaded image; images ride an `images:` frontmatter list, bytes under `assets/` with slugged names, and removing one keeps the file; templates write ordinary files the app never remembers came from a template; stats count prose only — synopsis and beats are planning — with the goal in `settings.goals`.)

One ordering choice was deliberate: the engine (stage 4) lands before GitHub sync (stage 5). By the end of stage 2 your writing is already safe locally — journal, atomic saves — and the engine is what makes this app *this app*. If you'd rather have remote backup sooner, the two stages swap cleanly; nothing in either depends on the other.

A handful of small decisions are deliberately left to their build stage, where they'll be cheap to make well: the PAT setup flow, the glyph picker, graph-layout persistence, the reference-library panel, commit-message templates, and the search indexing approach.
