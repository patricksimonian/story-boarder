# 07 — Research: Twine/Plottr import formats and playable-HTML export

Type: research
Status: resolved

## Question

V1 imports Twine and Plottr projects and exports a playable standalone HTML file (per [04](04-grilling-mvp-feature-set.md)). What exactly are those formats, and how do existing tools implement single-file playable export?

- **Twine**: the Twee 3 text format and the Twine 2 HTML/`.twee`/archive formats — structure, what a passage carries (links, tags, metadata), and how story formats (Harlowe/SugarCube) complicate importing logic vs. just prose+links.
- **Plottr**: the `.pltr` JSON schema — beats, plotlines ("lines"), cards, characters, places, tags; how stable/versioned the schema is.
- **Playable export**: how Twine compiles story + runtime into one self-contained HTML file (data island + JS runtime pattern); what our equivalent needs given our own conditions engine.

Feeds the domain model ([05](05-grilling-domain-model-and-file-format.md)) and the build.

## Answer

Full findings in the linked file (verified against the IFTF twine-specs repo, the open-source Plottr `lib/pltr` code, and Inky's export template). Key facts:

- **Twine** has two import surfaces: Twee 3 text (`:: Name [tags] {"position":"x,y"}` headers; `StoryTitle`/`StoryData` special passages with a required uppercase-UUID `ifid`) and published/archive HTML (a `<tw-storydata>` island with `<tw-passagedata pid/name/tags/position/size>` elements — parse with a DOM parser and read `textContent`; archives are concatenated islands).
- Universally importable from Twine: title/IFID/start passage, passages, tags, positions, and the `[[Display|Target]]` / `->` / `<-` link graph. Harlowe/SugarCube macros are story-format-specific: import bodies as prose, preserve `rawBody` + source format verbatim, and offer best-effort lifting of `if`/`set` into our conditions/effects as *suggestions only*.
- **Plottr `.pltr`** is one JSON file (a serialized Redux store): `file.version`, `series`, `books` (normalized `{allIds, byId}`), `beats` (since 2021.4.13 a per-book tree of `children`/`heap`/`index`, keyed by book id or `'series'`), `lines`, `cards`, `characters`, `places`, `tags`, `notes`, `images`, `hierarchyLevels`. Integer max+1 ids per collection; rich-text fields are Slate node arrays, not strings; `beat.title: "auto"` is a sentinel. Branch on `file.version`, tolerate unknown keys (post-2021 development is closed-source). Plottr has no branching/variables — imports seed structure and prose only.
- **Playable export**: copy Twine's model — a `player-template.html` with `{{STORY_NAME}}`/`{{STORY_JSON}}`/`{{RUNTIME_JS}}` markers, a once-bundled minified runtime IIFE, story JSON in a `<script type="application/json">` island (escape `<` as `<`). Ship conditions/effects/weighted-goto as a **typed JSON AST interpreted by a small eval-free interpreter** (CSP- and `file://`-safe), reuse that same interpreter for in-app simulation, and embed a second inert copy of the authoring JSON so every exported file is losslessly re-importable.

Findings file: [research/interchange-formats.md](../research/interchange-formats.md)
