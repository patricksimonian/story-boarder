# Existing Tools for Writing Video Game Stories — Survey & Synthesis

Research ticket: *What tools do people already use to write video game stories, what do their data models look like, and what minimal feature subset would a "simple" personal local-first app cherry-pick?*

Date: 2026-08-25. Audience: a beginner user, plus a later agent session that will design the app's domain model.

---

## Part 1 — Tool-by-tool survey

The tools fall into three families:

| Family | Tools | Core primitive |
|---|---|---|
| **Branching / interactive narrative** | Twine, Ink/Inky, Yarn Spinner, Arcweave, articy:draft | Node/passage graph with links, plus variables |
| **Prose planning & drafting** | Scrivener, Plottr, Campfire | Documents, scenes, timelines, character sheets |
| **World-building databases** | World Anvil, Campfire (partly) | Linked wiki-style articles/templates |
| **Generic boards** | Notion, Miro, Trello | Freeform pages, cards, canvases |

---

### Twine

- **What it models:** A story is a flat set of **passages** (title + tags + body text + x/y position on a map). Links between passages are written inline in the text as `[[Link text->Target Passage]]`; the graph view is *derived* from the links, not stored separately. Variables, conditionals, and macros exist but live inside passage text and are interpreted by the chosen **story format** (Harlowe, SugarCube, etc.), not by Twine itself.
- **Storage/format:** Extremely portable. Twine 2 publishes a story as a **single self-contained HTML file** (`<tw-storydata>` element containing `<tw-passagedata>` children with name, tags, position, and body). The community-standard plain-text equivalent is **Twee 3** (an IFTF-maintained open spec): each passage is `:: Passage Name [tags] {"position":"x,y"}` followed by its body; story metadata is a JSON block in a special `StoryData` passage. The editor itself stores work in browser local storage (web version) or local files (desktop app) — the web version's local-storage habit is a known data-loss footgun.
- **Powerful because:** near-zero learning curve for the core loop (write text, make `[[links]]`, see a map, click Play); output runs anywhere a browser runs; open formats mean stories outlive the tool.
- **Overwhelming because:** everything beyond linking requires learning a story-format's macro language (Harlowe vs SugarCube syntax differ, which confuses beginners); no built-in modeling of characters, scenes, or anything except passages; large stories become spaghetti maps with no hierarchy or folders.
- **Key takeaway:** The **passage = title + tags + body + position, links embedded in text** model is the minimum viable branching-story data model, and it has an open plain-text serialization (Twee) worth imitating.

### Ink / Inky (inkle)

- **What it models:** A pure **plain-text scripting language**. Content is organized into **knots** (`=== knot_name ===`, i.e., sections) and **stitches** (`= sub_section` within a knot). Flow moves via **diverts** (`-> knot_name`). Choices are lines starting with `*` or `+`; "weave" syntax lets nested choices/gathers express local branching without naming every node. Variables, conditions, lists, functions, tunnels, and threads exist for advanced logic. There is deliberately **no graph view** — structure lives in the text.
- **Storage/format:** `.ink` **plain text files** (open, diffable, git-friendly); the open-source compiler produces a documented **JSON runtime bytecode** consumed by C#/JS runtimes (Unity, web). Fully ownable, MIT-licensed.
- **Powerful because:** the most "writer-flow" friendly of all branching tools — it reads like a screenplay; scales to huge games (80 Days, Heaven's Vault); trivially version-controlled.
- **Overwhelming because:** it *is* programming — syntax errors, diverts to misspelled knots, weave nesting rules; no visual overview of story shape; characters/scenes/lore have no first-class representation at all (they're conventions in text).
- **Key takeaway:** Plain-text-first with a compile step is great for programmer-writers but wrong for a beginner GUI app; steal the *hierarchy* idea (knot → stitch = chapter → beat) and the "content is just text you read top to bottom" feel.

### Yarn Spinner (authoring side)

- **What it models:** `.yarn` files contain **nodes**: a header block of `key: value` lines (at minimum `title:`, optionally `tags:` and arbitrary metadata like location) separated from a **body** by `---`, terminated by `===`. Body = **lines of dialogue** (conventionally `Character: text`), **options** (`->`), jumps to other nodes, and `<<commands>>`/variables for game logic. Inspired by Twine; built for Night in the Woods.
- **Storage/format:** **Plain text `.yarn` files**, open spec (Yarn Spec on GitHub), open-source toolchain. Very portable and git-friendly.
- **Powerful because:** minimal syntax, "as close to just writing dialogue as possible"; strong Unity/Unreal/Godot integration; node metadata via headers is a nice extensible escape hatch.
- **Overwhelming because:** authoring is code-adjacent (VS Code extension is the main editor); logic/commands require engine hookup to mean anything; like Twine, no first-class characters/scenes.
- **Key takeaway:** The **node = header-metadata + free-text body** shape, and speaker-prefixed dialogue lines (`Name: line`) as a *convention rather than a schema*, are both beginner-friendly ideas.

### Arcweave

- **What it models:** The richest "visual middle-ground" model. A **project** contains:
  - **Boards** (nestable in folders) — canvases holding items.
  - **Elements** — the story nodes: title + rich-text content, cover image, color theme, position/size, attached **components**, custom **attributes**, and **outputs** (connections).
  - **Connections** — edges with source/target id + type, which can carry **labels/scripts**.
  - **Jumpers** — teleport nodes referencing an element elsewhere (tames spaghetti across boards).
  - **Branches** — dedicated if/elseif/else nodes whose **conditions** hold script expressions per output.
  - **Components** — reusable entities (characters, items, locations) in their own folder tree, with attributes and assets; attached to elements (e.g., as speakers).
  - **Variables** (typed: boolean/integer/etc., with initial values, in folders), **notes**, **assets** (image/audio/video), **locales** for translation.
- **Storage/format:** **Cloud/web app** (this is the catch). Export is good: a documented, stable **JSON export** (zip) covering all of the above including board coordinates, plus a web API and Unity/Unreal/Godot plugins. Ownable *content*, but the *tool* is subscription SaaS and the working copy lives in their cloud.
- **Powerful because:** best-in-class balance of visual graph + entity database + play mode; real-time collaboration; the component/attribute system gives structure without programming.
- **Overwhelming because:** boards vs elements vs components vs attributes vs variables vs branches vs jumpers is a lot of vocabulary; arcscript conditions are programming again; free tier limits; cloud dependency.
- **Key takeaway:** Arcweave's **separation of "flow nodes" (elements on boards) from "reusable entities" (components) that get *attached* to nodes** is the single best structural idea in this survey. Its JSON export is a good reference schema.

### articy:draft (3 / X)

- **What it models:** The industrial heavyweight. A hierarchical **Flow**: **Flow Fragments** (containers representing chapters/quests/scenes, nestable to any depth) contain **Dialogues**, which contain **Dialogue Fragments** (single line of speech, tied to a **speaker Entity**), plus Hubs, Jumps, Conditions, Instructions (script nodes). Alongside the flow: **Entities** (characters/items), **Locations** (with 2D maps), **Assets**, **Variables** (global variable sets), and a **Template system** letting you add typed custom property sheets ("features") to any object. Also simulation/presentation modes.
- **Storage/format:** **Proprietary Windows desktop app**; single-user projects are local proprietary files, multi-user requires a server. Exports exist (Unity/Unreal plugins, JSON/XML/Excel/Word) and are decent, but the *project* format is closed and the tool is license/subscription-gated.
- **Powerful because:** genuinely models a whole game narrative pipeline — nested structure, per-object templates, localization, voice-over management, engine round-tripping.
- **Overwhelming because:** it's the canonical example of the complexity ceiling — enterprise UI, template/feature configuration before you can write, Windows-only, closed format. Nobody recommends it to a solo beginner.
- **Key takeaway:** Two ideas worth noting, not copying wholesale: **nestable containers** (a node can *contain* a sub-flow — chapter → scene → line) and **speaker as a reference to a character entity** rather than typed text.

### Scrivener

- **What it models:** Prose-first. A **Binder** — a single **tree of documents and folders** (any document can have children; folders are just documents with a different icon). Each document has: rich text body, **synopsis** (index card), notes, label, status, keywords, and custom metadata. The **Corkboard** (index cards) and **Outliner** are just alternate views of the same tree — reorder cards and you reorder the manuscript. **Compile** assembles the tree into a manuscript. No branching, no variables.
- **Storage/format:** `.scriv` is a **folder masquerading as a file**: a `Project.scrivx` XML file (the binder tree + settings) plus one **RTF file per document** stored by UUID. Individual pieces are open formats (RTF/XML) and local, but the glue is Scrivener-specific and not meant for hand editing. Fully local-first; sync is your problem (Dropbox conventions).
- **Powerful because:** the "one tree, three views (tree / cards / outline), write in fragments, compile later" workflow is beloved; synopsis-vs-body separation lets you plan on cards and draft underneath.
- **Overwhelming because:** legendary learning curve — hundreds of preferences, compile system is a project in itself; no story-structure semantics (a scene is just a document).
- **Key takeaway:** Steal **"card = synopsis + body of the same object"** and **"multiple views over one tree"**. Also a cautionary tale: local-first done as an opaque folder-of-files still feels proprietary if no other tool can open the whole.

### Plottr

- **What it models:** The clearest *planning* domain model in the list. A project (`.pltr`) contains **Books** (grouped into a Series). Per book, a **Timeline**: a grid whose columns are **Chapters** (or freeform "beats") and whose rows are **Plotlines** (colored horizontal arcs, e.g., "Main Plot", "Romance subplot"). Cells hold **Scene Cards**: title + description + attached **Characters**, **Places**, and **Tags** + color. Separate top-level lists: **Characters** and **Places** (with customizable attribute templates), **Notes**, **Tags**. Plus story-structure **templates** (Hero's Journey, Save the Cat) that pre-populate beats. Export to Word/Scrivener.
- **Storage/format:** **Local-first desktop app**; a `.pltr` file is **JSON** (users hand-edit it; the docs acknowledge this). Optional Pro cloud sync. About as ownable as commercial software gets short of an open spec.
- **Powerful because:** the timeline × plotline grid makes structure *visible* without any graph; drag-and-drop reordering; character/place attachment gives lightweight cross-referencing; templates give beginners a starting skeleton.
- **Overwhelming because:** honestly, not very — it's one of the simplest here. Limits: it's a *planner*, not a writer (thin prose support), and no branching at all.
- **Key takeaway:** **Plottr is the closest existing thing to the target app.** Its model — `Series → Book → { beats[], plotlines[], cards[] (beat × plotline), characters[], places[], notes[], tags[] }` in one local JSON file — is a proven, beginner-legible domain model.

### World Anvil

- **What it models:** A cloud world-building wiki. A **World** contains **Articles** built from ~25+ **templates** (Character, Settlement, Item, Species, Organization, Myth…) with template-specific structured fields plus free text (BBCode-ish markup); articles **cross-link** heavily. Also interactive **Maps** (pins linking to articles), **Timelines** of events, **categories**, secrets/subscriber visibility, RPG campaign tools.
- **Storage/format:** **Cloud-only SaaS.** No local app, no full-fidelity export; getting your world *out* is notoriously partial (per-article HTML/text). The weakest ownership story in this survey — the standard example of cloud lock-in that "local-first" positioning reacts against.
- **Powerful because:** enormous breadth for deep lore worlds; templates prompt you with questions; great for sharing/publishing worlds to readers or TTRPG players.
- **Overwhelming because:** universally described as overwhelming for newcomers — dozens of template types, busy UI, features (monetization, campaigns, subscribers) irrelevant to a solo story writer; the template fields pressure you to fill in encyclopedic detail before any story exists.
- **Key takeaway:** An **anti-model** for this project: demonstrates both the appeal of "everything links to everything" and the trap of heavyweight templates + cloud lock-in.

### Campfire (Campfire Writing)

- **What it models:** **Modules**, purchased/enabled à la carte: Characters (panels: appearance, personality, stats, relationships), Worldbuilding/Locations, **Timeline**, Plot (arc boards), Relationships (node web), Magic systems, Species, Items, Maps, Research, plus a **Manuscript** word processor. Everything cross-links (mention a character in prose, hover for their sheet).
- **Storage/format:** Web + **desktop apps (Mac/Win) with an offline mode** — work is cached locally with cloud sync, so it's *offline-capable* rather than truly local-first; the canonical store is their cloud. Export of manuscripts to DOCX/PDF/HTML/RTF; structured module data doesn't round-trip to an open format.
- **Powerful because:** modularity is a genuinely good idea — beginners start with 2–3 modules and ignore the rest; friendlier than World Anvil; combines planning *and* drafting.
- **Overwhelming because:** module-by-module pricing adds up and forces meta-decisions; many modules replicate the World Anvil "fill in every field" trap; partial cloud dependence.
- **Key takeaway:** Steal the **progressive disclosure** principle: ship few entity types, make everything else optional or emergent (tags), rather than 15 modules.

### Generic boards: Notion, Miro, Trello (as used for story work)

- **What people actually do:** A huge share of solo writers and small game teams skip dedicated tools entirely. Patterns: **Notion** — a "story bible" workspace: databases of Characters / Locations / Scenes with properties and relations, kanban of scenes by status, free pages for drafts. **Trello** — one list per act/chapter, one card per scene/beat, labels for plotlines/POV, drag to reorder. **Miro** — freeform canvas of sticky notes and arrows for branching sketches and beat maps.
- **Storage/format:** All **cloud SaaS** with mediocre exports (Notion: markdown/CSV zip that breaks relations; Trello: JSON; Miro: images/PDF). Not ownable.
- **Powerful because:** zero new concepts — cards, lists, pages, stickies; you invent exactly as much structure as you need; this is strong evidence about what the *minimum sufficient* model is: **a card with a title and a description, in an ordered list, with labels**.
- **Overwhelming because:** no story semantics at all — no character↔scene links (except hand-built Notion relations), no timeline math, no branching links, structure decays as it grows.
- **Key takeaway:** The popularity of Trello/Notion for this job proves that **cards-in-ordered-lists + tags covers 80% of story planning**. A dedicated app wins by adding *just* the story-specific 20%: first-class characters, plotlines, and links.

---

## Part 2 — Synthesis

### 2.1 Ideas worth stealing (for a simple, local-first, solo-beginner storyline app)

1. **One local, human-readable file per project** (Plottr's `.pltr` = JSON; Twee = plain text). A single JSON (or JSON + markdown bodies) file the user can back up, sync, git, or open in a text editor is the heart of "ownable". Publish/export to a single self-contained HTML for sharing (Twine's trick).
2. **The card as the atomic unit: title + short synopsis + longer body** (Scrivener's index card + document; Trello card + description; Plottr scene card). Beginners think in cards.
3. **Ordered sequence of beats/chapters as the backbone, not a graph** (Plottr's timeline, Trello's lists, Ink's top-to-bottom readability). Default view = a linear/ordered story. Branching, if ever, comes later.
4. **Plotlines as colored rows crossing the sequence** (Plottr's plotline × chapter grid). This is the cheapest way to visualize multi-threaded structure and is instantly legible.
5. **Reusable entities separate from flow, attached by reference** (Arcweave components; articy speaker-entities; Plottr characters/places attached to cards). A small set: **Character, Place** — that's it. Attaching a character to a scene card is the story-specific superpower generic boards lack.
6. **Tags as the universal escape hatch** (Twine passage tags, Plottr tags, Trello labels). Anything the schema doesn't model, a tag can.
7. **Header-style extensible metadata** (Yarn's `key: value` node headers): let any card carry arbitrary key/values without schema migrations.
8. **Multiple views over one underlying tree/list** (Scrivener binder/corkboard/outliner): e.g., timeline view and simple list/outline view of the same beats — views are cheap, models are expensive.
9. **Starter templates** (Plottr's Hero's Journey / Save the Cat; World Anvil's prompt-questions in small doses): pre-seeded beats defeat blank-page paralysis for beginners.
10. **Speaker-prefixed dialogue as a convention, not a schema** (Yarn/Ink): if the app touches dialogue at all, `Name: line` in plain text beats a structured dialogue editor.

### 2.2 Complexity traps to avoid

- **Variables, conditions, and scripting engines** (Twine macros, arcscript, articy scripts, Ink logic). This is the #1 cliff where writing tools become programming tools. A story *planning* app for a beginner needs zero runtime logic.
- **Deep/unbounded node graphs** (Twine spaghetti, articy nested flows, Arcweave multi-board webs). Free-form graphs look empowering and become unmaintainable; every graph tool grew jumpers/hubs/folders just to manage the mess. An ordered list with optional "this beat links to that beat" annotations is enough.
- **Heavyweight world-building databases** (World Anvil's 25+ templates, Campfire's 15 modules). Dozens of entity types and mandatory-feeling fields push users into encyclopedia-writing instead of story-writing. Two entity types + freeform fields + tags.
- **Cloud accounts and sync as prerequisites** (Arcweave, World Anvil, Notion/Miro/Trello). Local file first; sync is the user's file system's problem.
- **Story-format/plugin fragmentation** (Twine's Harlowe vs SugarCube): don't make the user choose a "flavor" before writing.
- **Compile/publish pipelines as a core loop** (Scrivener compile, Ink→JSON, articy exports). Export should be one button producing one file.
- **Template/attribute configuration before content** (articy templates, World Anvil): the user should be able to type a beat title within 10 seconds of opening the app.
- **Opaque many-file project bundles** (Scrivener's `.scriv` folder): local ≠ ownable if the format is a maze; keep it one legible file.

### 2.3 Prior-art data models, in domain-modeling detail

**Twine / Twee 3 (passage graph):**
```
Story    { name, ifid, format, formatVersion, start, zoom, tags? }
Passage  { name (unique, is the link target), tags: string[],
           position: {x, y}, size?, text (body; links [[Text->Target]] embedded) }
```
Edges are not stored — they are parsed out of passage bodies. One flat namespace, no hierarchy.

**Ink (hierarchical text):**
```
Story = ordered text
  Knot  (=== name ===)          — chapter/section, addressable
    Stitch (= name)             — sub-section, addressable as knot.stitch
  Divert (-> target)            — flow control, inline
  Choice (* / +) with nested gathers (weave) — local branching without names
  + variables, conditions, functions (logic layer)
```
Model insight: two-level named hierarchy + anonymous local branching keeps most nodes unnamed.

**Yarn Spinner (node list):**
```
File  = Node[]
Node  { headers: { title (required, unique), tags?, ...arbitrary key:value },
        body: Line[] }         # header block, then ---, body, then ===
Line  = dialogue text ("Speaker: text" by convention) | option (-> …) | <<command>>
```

**Arcweave (boards + elements + components):**
```
Project { name, startingElement, boards{}, elements{}, connections{},
          jumpers{}, branches{}, conditions{}, components{}, attributes{},
          variables{}, notes{}, assets{}, locales{} }   # all keyed by id
Board      { name, children (folder tree), elements[], connections[], jumpers[], notes[] }
Element    { title, content(rich text), theme(color), x,y,w,h, outputs: connectionId[],
             components: componentId[], attributes: attributeId[] }
Connection { sourceid, targetid, sourceType, targetType, label? }
Jumper     { elementId (reference to remote element) }
Branch     { conditions: { ifCondition, elseIfConditions[], elseCondition } }
Component  { name, folder tree, attributes[], assets[] }   # characters/items/locations
Attribute  { cId (owner), cType, name, value {type, data} } # custom fields
Variable   { name, type, value }
```
Model insight: flow (elements/connections) and entities (components) are separate id-keyed tables; entities attach to flow nodes by reference; everything custom is an `Attribute` row.

**articy:draft (nested flow + entities + templates):**
```
FlowFragment (container; nests arbitrarily: chapter ⊃ quest ⊃ scene)
  Dialogue (container) ⊃ DialogueFragment { speaker: EntityRef, text, stageDirections }
  Hub / Jump / Condition / Instruction (flow-control node types)
Entity   { name, avatar, color, template: {features: {typed properties}} }
Location, Asset, VariableSet
Pins/Connections between siblings inside a container
```
Model insight: containment hierarchy (a node *has* an inner flow) + typed template system. Powerful, and the main source of its complexity.

**Scrivener (one tree, many views):**
```
Project { binder: DocNode tree, settings }
DocNode { title, synopsis (index card), body (RTF), notes, label, status,
          keywords[], customMetadata{}, children: DocNode[] }
```
Corkboard/outliner/manuscript are projections of this one tree.

**Plottr (timeline × plotlines) — closest prior art:**
```
File (.pltr, JSON) {
  series { name, books[] }
  beats[]      # ordered columns: chapters or freeform beats (per book)
  lines[]      # plotlines: { title, color, position } (rows)
  cards[]      # { title, description(rich text), beatId, lineId, positionWithinLine,
                #   characterIds[], placeIds[], tagIds[], color }
  characters[] # { name, description, ...customAttributes, tags[], imageId }
  places[]     # { name, description, ...customAttributes }
  notes[], tags[] { title, color }, images[]
  customAttributes { characters: [...], places: [...], cards: [...] }
}
```
Model insight: the card sits at the intersection (beatId × lineId); entities are flat lists linked by id arrays; custom attributes are declared per entity type, not per instance.

### 2.4 Recommended minimal feature subset ("cherry-pick")

For a simple personal local-first storyline app, the survey converges on:

- **Project = one JSON file on disk** (open, documented, hand-editable), with export-to-HTML/Markdown for sharing.
- **Core objects (5, no more):**
  1. `Story/Project` — name + metadata.
  2. `Beat` (scene card) — title, synopsis, body (markdown), order, optional plotline, color, tags, characterRefs, placeRefs. *(Twine passage + Scrivener card + Plottr scene card merged.)*
  3. `Plotline` — name + color (a row/lane; optional — a story with one plotline never shows the concept).
  4. `Character` — name, description, freeform fields, tags.
  5. `Place` — same shape as Character.
  plus `Tag` as a shared label type.
- **Two views over the same data:** an ordered outline/list (default) and a plotline × beat grid (Plottr-style) when >1 plotline exists.
- **Explicitly out of scope:** variables/conditions/scripting, playable branching runtime, free-form node canvases, template/attribute configurators, maps/timelines-with-dates, accounts/cloud/collab, compile pipelines.
- **Growth path (don't build now, don't preclude):** optional `links: beatId[]` on a Beat would later admit Twine-style branching without changing the core model; Yarn-style `metadata: {}` on every object admits extension.

---

## Sources

- Twee 3 Specification (IFTF): https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
- Twine 2 HTML output / story formats spec: https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-storyformats-spec.md
- Twee overview (Twine Cookbook): https://twinery.org/cookbook/terms/terms_twee.html
- Arcweave JSON export reference: https://docs.arcweave.com/integrations/json
- Arcweave export docs: https://docs.arcweave.com/project-tools/export
- Arcweave for developers: https://docs.arcweave.com/introduction/whom-is-it-for/developers
- articy Help — Flow fragments: https://www.articy.com/help/adx/Flow_Objects_FlowFragment.html
- articy Help — Dialogue fragments: https://www.articy.com/help/adx/Flow_Objects_DialogFragment.html
- articy — Exports tutorial: https://www.articy.com/en/articydraft-first-steps-tutorial-series-l12-exports/
- Yarn Spinner — Nodes and Lines: https://docs.yarnspinner.dev/write-yarn-scripts/scripting-fundamentals/lines-nodes-and-options
- Yarn language spec: https://github.com/YarnSpinnerTool/YarnSpinner/blob/main/Documentation/Yarn-Spec.md
- Writing with Ink (inkle): https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
- Ink JSON runtime format: https://github.com/inkle/ink/blob/master/Documentation/ink_JSON_runtime_format.md
- Scrivener binder/corkboard/outliner: https://www.literatureandlatte.com/blog/integrating-scriveners-binder-corkboard-and-outliner
- Scrivener project structure (forum, .scriv internals): https://www.literatureandlatte.com/forum/viewtopic.php?t=10104
- Plottr — Timeline overview: https://docs.plottr.com/article/54-timeline-overview
- Plottr — Plotlines: https://docs.plottr.com/article/56-timeline-plotlines
- Plottr — Scene cards: https://docs.plottr.com/article/57-timeline-scene-cards
- Campfire vs World Anvil (Kindlepreneur): https://kindlepreneur.com/campfire-vs-world-anvil/
- Campfire vs World Anvil (Campfire's own comparison): https://campfirewriting.com/learn/world-anvil-vs-campfire
- Campfire apps (offline/desktop): https://www.campfirewriting.com/apps
- World Anvil alternatives / lock-in discussion (LegendKeeper): https://www.legendkeeper.com/best-world-anvil-alternatives/
