# Interchange Formats: Twine Import, Plottr Import, Playable Single-File HTML Export

Research for the storyline app's import/export layer. Audience: the session designing the domain model and import/export code. All format details below were verified against the primary specs/repos listed in **Sources** (fetched 2026-08-26).

---

## 1. Twine formats

Twine has two interchange representations you must handle, both governed by specs maintained by the Interactive Fiction Technology Foundation (IFTF) in `iftechfoundation/twine-specs`:

1. **Twee 3** — a plain-text source format (`.twee` / `.tw`).
2. **Twine 2 HTML output** — the published/archived HTML containing a `<tw-storydata>` data island.

A third, the **Twine 2 archive format**, is just multiple `<tw-storydata>` blocks concatenated in one file.

### 1.1 Twee 3 (plain-text source)

**File**: UTF-8 text, extension `.twee` or `.tw`. A file is a sequence of passages.

**Passage header grammar** — a line starting with the sigil `::` at column 0:

```
:: PassageName [tag1 tag2] {"position":"600,400","size":"100,200"}
```

- `::` start token (must begin the line).
- **Name** (required). Characters `[`, `]`, `{`, `}`, `\` inside names/tags must be backslash-escaped (`\[`, `\]`, `\{`, `\}`, `\\`). On decode, `\x` → `x`.
- **Tag block** (optional): space-separated tags in `[...]`.
- **Metadata block** (optional): an inline JSON object, conventionally carrying editor-only data — `"position"` (`"x,y"` of the passage box's upper-left in the Twine map) and `"size"` (`"w,h"`). Both are comma-separated strings, not numbers.
- Everything until the next `::` line (or EOF) is the passage body, verbatim.

**Example passage:**

```twee
:: An overgrown path [forest spooky] {"position":"600,400","size":"100,200"}
The path disappears into brambles ahead.

[[Push through->Bramble Thicket]]
[[Turn back|Trailhead]]
```

**Special passages** (identified by name):

- `StoryTitle` — body is the story's title (maps to `<tw-storydata name>`).
- `StoryData` — body is a JSON object with story-level metadata:

```twee
:: StoryData
{
  "ifid": "6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC",
  "format": "Harlowe",
  "format-version": "3.0.2",
  "start": "Trailhead",
  "tag-colors": { "spooky": "purple" },
  "zoom": 1.0
}
```

  - `ifid` (string, required): Interactive Fiction IDentifier — an uppercase UUID uniquely identifying the story. Generate a fresh one (uppercased UUIDv4) when creating stories; **preserve it on round-trip** (it's the story's stable identity across tools).
  - `format` / `format-version` (optional strings): story format name and semver.
  - `start` (optional): name of the starting passage (defaults to a passage named `Start` if absent).
  - `tag-colors` (optional object): tag name → color word.
  - `zoom` (optional decimal): editor zoom.

**Special tags**: a passage tagged `script` is story-wide JavaScript; tagged `stylesheet` is story-wide CSS.

**Link syntax** (technically rendered by the story format, but the syntax is shared across Harlowe/SugarCube/Snowman and is what the Twine editor itself parses to draw graph arrows — safe to treat as universal):

| Form | Meaning |
|---|---|
| `[[Passage]]` | display text = target name |
| `[[Display\|Target]]` | pipe: text left, target right |
| `[[Display->Target]]` | right arrow: text left, target right |
| `[[Target<-Display]]` | left arrow: target left, text right |
| `[[Display\|Target][$a to 5]]` | SugarCube-only "setter link" — trailing `[...]` is a TwineScript expression run on click |

Parsing order gotcha: check for `->`, then `<-`, then `|`; the target may itself contain spaces. A workable extraction regex (target resolution in comments):

```js
const LINK_RE = /\[\[(.*?)\]\](?:\[(.*?)\])?/g; // group 2 = SugarCube setter, keep raw
function parseLinkBody(body) {
  let m;
  if ((m = body.match(/^(.*?)->(.*)$/))) return { text: m[1], target: m[2] };
  if ((m = body.match(/^(.*?)<-(.*)$/))) return { text: m[2], target: m[1] };
  if ((m = body.match(/^(.*?)\|(.*)$/)))  return { text: m[1], target: m[2] };
  return { text: body, target: body };
}
```

### 1.2 Twine 2 published HTML — the `<tw-storydata>` data island

A published Twine story is a single HTML file: story-format runtime (HTML/CSS/JS) + an inert data island. The island is what you import.

```html
<tw-storydata name="DocumentationExample" startnode="1" creator="Twine"
  creator-version="2.3.3" ifid="6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC"
  zoom="1" format="Harlowe" format-version="3.0.2" options="" hidden>
  <style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css">
    /* user CSS, applied at story start */
  </style>
  <script role="script" id="twine-user-script" type="text/twine-javascript">
    /* user JS, run at story start */
  </script>
  <tw-tag name="spooky" color="purple"></tw-tag>
  <tw-passagedata pid="1" name="Trailhead" tags="forest" position="400,200" size="100,100">
    The trail begins here.

    [[An overgrown path]]
  </tw-passagedata>
</tw-storydata>
```

**`<tw-storydata>` attributes**: `name` (required), `ifid` (required; 8–63 chars of digits/capitals/hyphens), `startnode` (PID of start passage — note: a PID, not a name), `creator`, `creator-version`, `format`, `format-version`, `tags`, `zoom`, plus `options` and the `hidden` attribute (keeps the island from rendering).

**`<tw-passagedata>` attributes**: `pid` (required; numeric id local to this file — **not stable across publishes**, don't use as identity), `name` (required — links reference names, so name is the real key), `tags` (space-separated), `position` (`"x,y"`), `size` (`"w,h"`). Passage source is the element's text content, HTML-entity-escaped in the raw file — so **parse with a real DOM/HTML parser and read `textContent`**; never regex the raw bytes (`&lt;&lt;set&gt;&gt;` etc. must be unescaped).

**`<tw-tag>`**: maps a tag name to a color (`gray|red|orange|yellow|green|blue|purple`).

**Archive format** (`Twine → Archive`, usually saved as `*.html`): simply one or more `<tw-storydata>` blocks concatenated in a single file, each per the HTML-output spec. Importer: query for **all** `tw-storydata` elements, not just the first, and offer multi-story import.

### 1.3 Practical import strategy: universal vs. format-specific

**Universally importable (format-agnostic, safe to map into your domain model):**
- Story metadata: title, IFID, start passage, tag colors, zoom.
- Passages: name, tags, body text, editor position/size (map to your canvas coordinates).
- The **link graph**: extract `[[...]]` links from bodies as above. Broken links (target passage doesn't exist) are legal in Twine — represent them as dangling edges, don't drop them.
- `script`/`stylesheet` passages and the user style/script islands: import as raw attached assets.

**Story-format-specific (Harlowe, SugarCube, Chapbook, Snowman — NOT portable):**
- All macro/scripting syntax: Harlowe `(set: $x to 1)`, `(if: ...)[...]`, hooks `|name>[...]`; SugarCube `<<set $x = 1>>`, `<<if>>...<</if>>`, setter links; Chapbook's vars section (`var: value` above `--`); Snowman's ERB-style `<% %>` JavaScript.
- Variables, conditional display, audio/save macros, CSS conventions per format.

**How existing importers handle this — and what you should do:**
1. **Import passage bodies as prose, preserving raw text verbatim** in a dedicated field (e.g., `passage.rawBody` + `passage.sourceFormat: "Harlowe 3.x"`). Never attempt to transpile macros on import; lossy conversion silently corrupts stories.
2. Read the `format`/`format-version` attributes (or `StoryData.format`) and record them so the UI can label what wasn't interpreted.
3. Optionally run a **best-effort lift**: recognize the handful of high-value constructs (links incl. setter-link targets, `(if:)`/`<<if>>` wrapping a link → candidate for your declarative condition, `(set:)`/`<<set>>` → candidate effect) and surface them as *suggestions*, never silent conversions.
4. Strip or visually de-emphasize macro noise when displaying prose, but round-trip from `rawBody` if the user re-exports to Twee.
5. Export side: emitting **Twee 3** is trivial and the best "give my data back" format (write `StoryTitle`, `StoryData` with preserved IFID, then passages with `position` metadata).

---

## 2. Plottr `.pltr` format

A `.pltr` file is **a single JSON document** — a serialized Redux store. There is no official public schema doc; the authoritative reference is the formerly-open-source app code (`lib/pltr` in the Plottr electron repo / `Plotinator/plottr_templates` mirror), specifically `lib/pltr/v2/store/initialState.js`, `newFileState.js`, and the `migrator/migrations/` directory.

### 2.1 Top-level keys (v2, current era ≈ 2021.4.13 and later)

```jsonc
{
  "file":   { "fileName": "MyBook.pltr", "loaded": true, "dirty": false, "version": "2021.6.9" },
  "ui":     { "currentView": "timeline", "currentTimeline": 1, "darkMode": false /* + sort/filter/zoom prefs */ },
  "series": { "name": "", "premise": "", "genre": "", "theme": "", "templates": [] },
  "books":  { "allIds": [1], "1": { "id": 1, "title": "", "premise": "", "genre": "",
              "theme": "", "templates": [], "timelineTemplates": [], "imageId": null } },
  "beats":  { /* per-book trees — see below */ },
  "lines":  [ { "id": 1, "bookId": 1, "color": "#6cace4", "title": "Main Plot", "position": 0,
                "characterId": null, "expanded": null, "fromTemplateId": null } ],
  "cards":  [ /* scene cards — see below */ ],
  "characters": [ /* see below */ ],
  "places": [ /* like characters, minus categoryId */ ],
  "tags":   [ { "id": 1, "title": "", "color": null } ],
  "notes":  [ { "id": 1, "title": "", "content": [/*RCE*/], "tags": [], "characters": [],
               "places": [], "lastEdited": null, "templates": [], "imageId": null, "bookIds": [] } ],
  "images": { "1": { "id": 1, "name": "", "path": "", "data": "" } },  // data = base64
  "categories": { /* character/note/tag categories, each with a "Main" default */ },
  "customAttributes": { /* user-defined fields per entity type */ },
  "hierarchyLevels": { /* level defs incl. { dark: {borderColor,textColor}, light: {...} } */ },
  "featureFlags": {}
}
```

Key entity shapes (defaults from `initialState.js`, quoted fields verbatim):

**Card** (a scene card on the timeline grid — the cell at line × beat):

```json
{ "id": 1, "lineId": null, "beatId": null, "bookId": null,
  "positionWithinLine": 0, "positionInBeat": 0,
  "title": "", "description": [ { "type": "paragraph", "children": [ { "text": "" } ] } ],
  "tags": [], "characters": [], "places": [], "templates": [],
  "imageId": null, "fromTemplateId": null, "color": null }
```

**Character**:

```json
{ "id": 1, "name": "", "description": "", "notes": [ /* RCE */ ], "color": null,
  "cards": [], "noteIds": [], "templates": [], "tags": [],
  "categoryId": null, "imageId": null, "bookIds": [] }
```

**Beat** (a timeline column — chapter/act/scene-row depending on hierarchy level):

```json
{ "id": 1, "bookId": "series", "position": 0, "title": "auto", "time": 0,
  "templates": [], "autoOutlineSort": true, "fromTemplateId": null, "expanded": true }
```

`"title": "auto"` means "auto-number me" ("Chapter 3" etc.); treat it as a sentinel, not a literal title.

### 2.2 The beats tree (post-2021.4.13)

Migration `2021.4.13.js` converted `beats` from a **flat array** into a **per-book tree map**. Keys are book ids **plus the string `'series'`** (series-level timeline); each value is a tree with three parallel maps:

```jsonc
"beats": {
  "series": { "children": { "null": [] }, "heap": {}, "index": {} },
  "1": {
    "children": { "null": [7], "7": [8, 9] },   // parent id -> ordered child beat ids; root = null
    "heap":     { "7": null, "8": 7, "9": 7 },  // beat id -> parent id
    "index":    { "7": { "id": 7, "bookId": 1, "title": "auto", "position": 0, ... },
                  "8": { ... }, "9": { ... } }  // beat id -> beat object
  }
}
```

`children[null]` holds the top-level beats (e.g., chapters); nested levels (acts→chapters→scenes) come from `hierarchyLevels`. For import you can flatten: walk `children` from `null`, ordered by each beat's `position`.

### 2.3 Rich text: RCE / Slate nodes

Long-form text (`card.description`, `character.notes`, `place.notes`, `note.content`, custom "paragraph" attributes) is **not a string** — it's a Slate.js node array ("RCE" in Plottr code):

```json
[ { "type": "paragraph", "children": [ { "text": "She finds the key.", "bold": true } ] } ]
```

Importer needs a small Slate→(your rich text / markdown / plain) walker: node `type`s include `paragraph`, `heading-*`, `bulleted-list`/`numbered-list`/`list-item`, `image-data`/`image-link`, `link`; leaf marks include `bold`, `italic`, `underline`. Defensive rule: if the value is a plain string (very old files or "text"-type custom attributes), accept it as one paragraph.

### 2.4 Versioning, ids, gotchas

- **`file.version`** holds the app version that wrote the file (versions are date-like semver: `2021.6.9`). The app migrates files forward on open via an ordered chain of migrations (`0.6 … 1.3`, then `2020.3.4 … 2021.6.9` in the open-source era), compared with semver ordering. **Import rule: check `file.version` first** and branch on the era:
  - **v1 era (≤1.3)**: different vocabulary — `scenes`/`chapters` instead of `beats`, a `storyName`, no books. Realistically fine to reject or handle via a minimal shim; such files are rare in 2026.
  - **2020 era**: v2 shape, `beats` (and earlier `chapters`) as **flat arrays**, separate `seriesLines` array.
  - **2021.2.4**: `seriesLines` merged into `lines` with `bookId: "series"`; cards' `seriesLineId` renamed to `lineId` (ids remapped).
  - **2021.4.13**: beats flat array → per-book tree + `hierarchyLevels` added (structure above).
  - **2021.6.9**: cosmetic (`hierarchyLevels[i].dark/.light` colors).
  - **Post-open-source (2022+ / Plottr Pro)**: development continued closed-source; files keep the same JSON-Redux shape and version-chain approach, but assume **unknown additional keys and further migrations exist**. Be lenient: ignore unknown keys, never round-trip-rewrite a `.pltr` you didn't fully parse.
- **Ids** are plain integers, per-collection, allocated as `max(existing ids) + 1` (see `store/newIds.js`). They are unique only *within* a collection (`cards` id 3 and `tags` id 3 coexist). `bookId` is special: integer **or** the string `'series'`.
- Cross-references are id arrays: `card.characters: [characterId]`, `card.tags: [tagId]`, `character.bookIds`, etc. `images` is an object keyed by stringified id, with base64 `data` inline (files can be large).
- **Series vs book**: one `.pltr` = one project = one `series` + N `books`. Lines, beats, and cards belong to a book (or `'series'`); characters/places/notes/tags are project-global, scoped to books via `bookIds`.

**Suggested domain mapping** for import: book → story project; beats tree (flattened per hierarchy level) → chapters/sections; lines → plotlines/threads; cards → scene/beat nodes (prose from `description`); characters/places/tags/notes → corresponding entities. Plottr has **no branching, conditions, or variables** — a Plottr import seeds structure and prose only; the interactive layer is authored afterward in your app.

---

## 3. Playable single-file HTML export

### 3.1 How Twine does it (the model to copy)

Two pieces:

1. **Story format package** (`format.js`): a JSONP-style file calling `window.storyFormat({...})` with properties `name`, `version` (semver, required), author/description/etc., `proofing` (bool), and — the payload — **`source`**: *"an adequately escaped string containing the full HTML output of the story format, including the two placeholders `{{STORY_NAME}}` and `{{STORY_DATA}}`"*. `source` is a complete HTML document with the runtime engine (Harlowe/SugarCube JS+CSS) already inlined.
2. **Publishing** = pure string substitution: Twine serializes the story to a `<tw-storydata>` island (HTML-escaping passage text) and replaces `{{STORY_DATA}}` with it, `{{STORY_NAME}}` with the title. Output: one `.html`, zero network dependencies. At runtime the engine boots, queries its own document for `tw-storydata`, reads `startnode`, and renders.

Properties worth copying: template and data are decoupled (runtime can be updated independently); the data island doubles as the *import* format (any published file is re-importable — self-describing archive); everything is offline-first.

### 3.2 How Ink/inkjs does it

Inky's "Export for web" writes a **folder of five files**: `index.html` (page shell that loads the rest), `ink.js` (the inkjs engine — the ink runtime compiled to JS), `<story>.js` (the compiled story as JSON assigned to a global: `var storyContent = {...};`), `main.js` (the driver: instantiates `new inkjs.Story(storyContent)`, loops `story.Continue()`, renders paragraphs and `story.currentChoices` as clickable elements), and `style.css`. It is *not* single-file out of the box, but the recipe is identical to Twine's after inlining: engine + compiled-story-JSON-in-a-global + small driver + shell. Community single-file builds just inline all four assets into `index.html`.

The shared pattern across Twine, Ink, and similar tools (Yarn Spinner web runners, ChoiceScript's compiled export):

```
[HTML shell] + [inlined CSS] + [inlined engine JS] + [inlined story data (JSON or data island)] + [inlined driver/boot JS]
                                            → one self-contained .html
```

### 3.3 Recommended architecture for this app's export

The app has its own declarative engine (typed variables, boolean-expression conditions, effects, weighted chance). Recommendation:

**A. Compile the authoring model to a runtime story JSON.** Strip editor-only data (canvas positions, notes, Plottr provenance); keep nodes/passages, choices, and the declarative logic. Crucially, ship conditions/effects as **structured AST/ops, not code strings**:

```jsonc
{
  "formatVersion": "1.0.0",            // version the RUNTIME JSON contract, semver, from day one
  "meta": { "title": "…", "ifid": "A1B2…", "start": "n_intro" },
  "variables": { "trust": { "type": "int", "initial": 0 },
                 "hasKey": { "type": "bool", "initial": false } },
  "nodes": {
    "n_intro": {
      "text": "…",
      "choices": [
        { "text": "Pick the lock",
          "condition": { "op": "and", "args": [
              { "op": "gte", "left": { "var": "trust" }, "right": { "lit": 2 } },
              { "op": "not", "args": [ { "var": "hasKey" } ] } ] },
          "effects": [ { "set": "hasKey", "to": { "lit": true } } ],
          "goto": { "weighted": [ { "target": "n_success", "weight": 3 },
                                   { "target": "n_snap",    "weight": 1 } ] } }
      ]
    }
  }
}
```

An AST interpreter (~a few hundred lines) is trivially safe: no `eval`/`new Function`, so the exported file works under strict CSP and file:// alike, and the same interpreter runs in the editor's preview — one engine, two hosts.

**B. Build the runtime once as a single minified IIFE asset** (`runtime.js`: interpreter + state store + renderer + history/undo + save/load via `localStorage` in try/catch + seedable RNG for the weighted picks so playthroughs can be reproducible/testable). Store it in the app as a string asset produced by your normal bundler build.

**C. Export = template substitution, exactly like Twine.** Ship a `player-template.html` with markers:

```html
<title>{{STORY_NAME}}</title>
<style>/* inlined player CSS */</style>
<script id="story-data" type="application/json">{{STORY_JSON}}</script>
<div id="player"></div>
<script>{{RUNTIME_JS}}</script>
```

Boot code: `Runtime.start(JSON.parse(document.getElementById('story-data').textContent), '#player')`.

**Escaping rules (the classic bugs):**
- Embedding JSON inside `<script type="application/json">`: the only dangerous sequences are `</script` and `<!--`. Escape by replacing `<` with `<` in the serialized JSON (valid JSON, inert in HTML). Same rule if you instead emit `var storyContent = {...}`.
- If any user text can contain `]]>` or raw HTML, that's fine here — it's inside JSON string literals once `<` is escaped.
- Write the file UTF-8 with `<meta charset="utf-8">` first in head.

**Constraints to honor:** no external requests at all (fonts, CDNs — inline or use system stacks) so the file works offline and under `file://`; keep embedded images as data URIs but warn on size; and consider also embedding a **second, inert copy of the authoring-model JSON** (`<script type="application/json" id="source-data">`) so any exported file can be re-imported losslessly into the app — the Twine data-island trick, and cheap insurance for a local-first tool.

---

## Sources

- Twee 3 Specification (IFTF) — https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
- Twine 2 HTML Output Specification (IFTF) — https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-htmloutput-spec.md
- Twine 2 Archive Specification (IFTF) — https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-archive-spec.md
- Twine 2 Story Formats Specification (IFTF; `format.js`, `{{STORY_NAME}}`/`{{STORY_DATA}}`) — https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-storyformats-spec.md
- SugarCube 2 documentation (link markup, setter links) — https://www.motoslave.net/sugarcube/2/docs/
- Plottr templates/lib mirror (contains full `lib/pltr`) — https://github.com/Plotinator/plottr_templates
  - `lib/pltr/v2/store/initialState.js` — entity shapes — https://raw.githubusercontent.com/Plotinator/plottr_templates/master/lib/pltr/v2/store/initialState.js
  - `lib/pltr/v2/store/newFileState.js` — top-level keys of a new file — https://raw.githubusercontent.com/Plotinator/plottr_templates/master/lib/pltr/v2/store/newFileState.js
  - `lib/pltr/v2/store/newIds.js` — id allocation (max+1) — https://raw.githubusercontent.com/Plotinator/plottr_templates/master/lib/pltr/v2/store/newIds.js
  - `lib/pltr/v2/reducers/tree.js` — beats tree structure (`children`/`heap`/`index`) — https://raw.githubusercontent.com/Plotinator/plottr_templates/master/lib/pltr/v2/reducers/tree.js
  - `lib/pltr/v2/migrator/migrations/` — version history (`2021.2.4.js` seriesLines merge, `2021.4.13.js` beats→tree, `2021.6.9.js`) — https://github.com/Plotinator/plottr_templates/tree/master/lib/pltr/v2/migrator/migrations
- Plottr desktop app repo (historical open source) — https://github.com/cameronsutter/plottr_electron
- Inky "Export for web" file structure — Unofficial Ink Cookbook, Ch. 12 — https://videlais.github.io/Unofficial-Ink-Cookbook/Chapter12/ and https://videlais.com/2018/08/29/ink-for-the-web-part-1-exporting-for-web/
- Inky export template source — https://github.com/inkle/inky/blob/master/app/export-for-web-template/index.html
