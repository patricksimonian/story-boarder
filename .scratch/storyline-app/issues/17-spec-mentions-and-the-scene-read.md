# 17 — Spec: mentions and the scene read

Type: spec
Status: specified 2026-09-08 (Patrick's ask, from both README to-dos; revised in conversation the same day on his two corrections: a literal matcher is not enough because writers misspell and words carry more than one meaning, and the model is not a garnish on a highlighter but the reading the coach's continuity work stands on). Needs [15](15-spec-the-assistant-runner.md) for the runner, [11](11-spec-the-model-coach.md) for the staged-workflow shape, and [14](14-spec-tags-on-everything.md) for the alias convention. The runner is not built yet; the first three sections here ship without it.

## The ask

Two things from the README, which turn out to be one thing. First: prose should light up where it names something the story knows, a character, a place, a lore page, a note, a scene, a variable, and hovering should say what the connection is and let the writer jump to it. Second: the coach should check continuity and keep a log of developments, events and character changes, so the story stays free of contradictions.

They are one thing because both need the same fact: which entities a scene touches and what it says about them. You cannot log that Mara's hand is bandaged in Tanner's Row without knowing that "the smith's daughter" is Mara, and the reading that resolves the phrase is the reading that notices the bandage. So this spec has one model workflow, the scene read, whose output feeds three consumers: the highlighting in the editor, the development ledger, and the continuity findings. Beneath it sits a deterministic matcher that runs on every keystroke, because nothing on the keystroke path may wait on a process.

Prose stays plain. No link syntax is ever written into a Markdown file; every connection is computed from the story and drawn over the text.

## The matcher

`src/mentions/` is a pure module. `dictionary(story)` builds the lookup: every reference entity's title and aliases (below), every note's title, every scene's title, every variable's id, each mapped to `{ kind, id }`. `findMentions(text, dictionary, opts)` returns spans, `{ from, to, quote, entity, certainty }`, in two passes.

The literal pass finds titles and aliases as whole words, allowing a trailing possessive (`Rook's`, `the Vault's`) and a leading article for titles that carry one (`The Vault` matches `the Vault`). Matching is case-sensitive on the first letter of a proper noun: `the vault` in lower case is not The Vault, because a writer who means the place writes it the way the page is titled, and the one who means a cupboard does not. Longest match wins, so a lore page titled "Dalia's Blessing" claims that phrase whole and the character Dalia inside it is not a second span. Variable ids match only as themselves; prose says "if Mara is alive", never `mara_alive`, and bridging that through the description is the scene read's job, not this one's. These spans are `certain`.

The fuzzy pass runs on words the literal pass left alone. A word within a bounded edit distance of a dictionary entry (one edit up to five letters, two beyond) is a `probable` span carrying its candidate. This is what catches `Daila` and `Dalai's`. It never fires on common words: the pass consults a stoplist of the story's own most frequent words computed at load, so a character named "Will" does not turn every "will" into a probable.

On an entity's own page the entity is not a span. `mentionIndex(story)` runs the literal pass over everything and returns, per entity, every place it is named, which is the reverse index the variable ledger in `src/engine/usage.ts` already gives variables.

## The verdict store

Spans are fragile; offsets move with every edit. What survives an edit is text, so decisions about mentions are keyed by text, never by position. A verdict says: in this scene or note, this quoted phrase means this entity, or means nothing. `mentions.json` at the story root holds the writer's own verdicts, and only those:

```json
{
  "scene:cold-city": [
    { "quote": "Rook", "entity": null, "by": "writer" },
    { "quote": "Daila", "entity": "character:mara", "by": "writer" }
  ]
}
```

Items and entities are both written `kind:id`, because a note and a character can share a slug.

A verdict applies to every occurrence of that phrase in that item. The writer makes one from the tooltip: "not a mention", "means Mara", "fix the spelling" (which edits the prose through the ordinary mutation and needs no verdict at all). The file is in the story folder because a correction is a human decision about the story, the same footing as an alias. It is small, readable, and a writer who deletes it loses nothing but corrections.

The model's verdicts live elsewhere (the ledger, below). At render time the layers merge in fixed precedence: writer, then model, then fuzzy, then literal. A writer's "not a mention" beats everything, forever.

## Aliases

A reference entity gains `aliases: [...]` in its frontmatter, the same word 14 uses for a tag's old spellings and with the same meaning: other strings that name this thing. `the smith`, `Rook of Tanner's Row`, `the old man`. The library page shows them as a chips field beside tags, and the dictionary includes them. An alias is where a model's discovery becomes durable: once "the smith" is an alias of Rook, the literal pass finds it on the next keystroke with no model in the loop. `parseReferenceFile` and `serializeReferenceFile` in `src/files/referenceFile.ts` carry the field like `tags`.

## In the editor

One ProseMirror plugin, added to `proseExtensions()` in `src/editor/prose.ts`, so scenes, notes, and library pages all get it from the one `ProseEditor` they share. It walks the text nodes on each transaction, runs the matcher, merges the verdict layers, and builds inline decorations. Decorations never enter the document, so `readProse` returns exactly what the writer typed and the file stays clean.

Three styles, distinct without color alone, like storyline glyphs: certain mentions underlined, probables dotted, and mentions the model found that no dictionary entry covers ("the smith's daughter" before it became an alias) underlined with a lighter weight. Hover opens a tooltip: the entity's kind and title, then for a character or place the developments this scene records about it and the last development before it in lane order (from the ledger, when there is one; otherwise the first lines of the body), then a count of other mentions with the three nearest by title. Click navigates: a scene through `openScene`, a note or library page the way `SearchView`'s open handler already routes them. The tooltip carries the verdict actions from the section above, and for a probable it leads with "did you mean Mara?".

The plugin takes the merged verdicts as a prop, since the editor owns its document while the writer types and only the app knows the story; a change in verdicts or dictionary reconfigures the plugin without remounting the editor.

## Workflow: `read-scene`

**Target:** a scene (synopsis, beats, and prose) or a note (body). Library pages are read too, as the source of aliases, but they are not scenes and produce no developments.

**Briefing,** built by `brief(story, target)` and nothing else: the target's text; the roster of library pages by kind, each with title and aliases, and the titles of notes and scenes; the matcher's certain spans, listed so the model does not repeat them; the matcher's probables with their candidates, for a verdict; the target's characters field; the ledger entries for the previous scene in each lane the target sits in, so a development can be read as a change rather than a first appearance; and the variables the scene's effects and conditions touch, with descriptions. Bounded by the roster and one scene's length, never by the story's.

**Rubric.** Resolve only what the text supports; a pronoun with two possible referents is left alone. Say no when a candidate is wrong, and say why in a phrase. A development is a fact the scene asserts or changes about a named entity, in one plain sentence, with the writer's sentence quoted verbatim as evidence. Developments are about the story world (where someone is, what they know, what they have, what has happened to them), not about the writing. Few and high-confidence, as 11 says. Never propose prose. Use the story's own words: the rubric carries the glossary from CONTEXT.md.

**Schema:**

```json
{
  "mentions":     [ { "quote": "the smith's daughter", "entity": "mara" } ],
  "rejected":     [ { "quote": "Rook", "candidate": "rook", "why": "the synopsis says the scene never mentions him" } ],
  "developments": [ { "entity": "mara", "fact": "Her right hand is bandaged after the forge", "quote": "the writer's sentence" } ]
}
```

Tier: `small`. Classification and extraction against a known roster.

**Aliases proposed.** A mention whose quote is a noun phrase, not a pronoun, and recurs in the ledger across two or more items becomes a ghost chip on the entity's alias field, tick and ×, exactly the tag pattern from 16. Accepting writes the alias through the ordinary library edit. Nothing else the read returns touches the story folder.

**When it runs.** On idle after typing stops, on save, and from a **Read** button on the item, with Cancel. Never per keystroke. The writer sees the matcher's spans at once and the model's refinement a few seconds later.

## The development ledger

Derived data, keyed by content. `src/assistant/ledger.ts` holds, per item, the hash of the text that was read and the read's output: mentions, rejections, developments. A scene whose hash is unchanged is never sent again, so a whole-story pass costs one call per changed scene and a second pass costs nothing.

The ledger is machine output and stays out of the story folder, by 11's rule that the folder holds only what the human confirmed. On the desktop it lives in the app data directory under the story's name; in the browser, in IndexedDB beside the journal. Losing it costs one re-read.

The **Coach view** gains a **Developments** section: every entity with its developments in lane order, each a link to its scene with the quote. This is the log the README asks for, read straight from the ledger, and it is the writer's first check on whether the model read their story the way they meant it.

## Continuity

The synthesis stage from 11, with the ledger as its input instead of the scenes. Scope is one storyline at a time: the app walks the lane with the simulator's continue exits (`startSimulation` and `take` in `src/engine/simulate.ts`), so it has the variable state at every scene as well as the developments, and hands the model the ledger entries for those scenes in that order plus the registry with descriptions. Nothing else; the prose never travels twice.

**Rubric.** A contradiction is two developments that cannot both hold on this path, or a development that contradicts the variable state the engine has at that point (`mara_alive` is true and Mara is in the ground). Name both ends with their quotes. Do not report a change over time as a contradiction; a wound that heals is continuity working. Few, and each one a sentence a writer would nod at.

**Schema:**

```json
{ "contradictions": [ { "message": "Rook leaves the city in Cold City and is at the market two scenes later", "evidence": [ { "scene": "cold-city", "quote": "..." }, { "scene": "tanners-row", "quote": "..." } ] } ] }
```

Tier: `large`. This is reasoning over a whole lane, and the calls are few.

Findings are pending state, ephemeral like every suggestion, and appear in the **Analysis** view under a Continuity heading in the same jump-to-source list the static findings use: the `Finding` in `src/engine/analyse.ts` gains a `continuity` kind and an `evidence` list, severity `warning`. Each has a dismiss. The Problems bar counts them while they stand. "Check the whole story" is this per storyline, in sequence, with a progress line and Cancel.

## Restraint, and what the writer is told

Every read and every finding is grounded in a quote, and the writer can overrule any of it in one click with a verdict that stays. The Coach view's disclosure from 15 covers what leaves the machine. The Read button's title attribute says the same in one line.

## Tests

The matcher is a table test: possessives, leading articles, first-letter case, longest match over a nested title, the fuzzy bound at both lengths, the stoplist, the self-page exclusion, and `mentionIndex` on the sample story. The plugin is a jsdom test: mount `ProseEditor` with a dictionary, assert the spans are decorated and that `readProse` returns the input unchanged; then hand it a writer verdict and assert the decoration is gone. Briefings are pure: for the largest sample scene, assert the certain spans and probables appear, the previous lane scene's ledger entry appears, and the whole is under a stated size. The workflow is an App test with `StubProcessRunner`: a canned read arrives, assert the ledger holds it, that "the smith's daughter" is now decorated, that the alias ghost chip appears and ticking it rewrites the library file; then edit an unrelated scene, run again, and assert the runner was called once. Precedence is one test: writer verdict over a canned model mention. Continuity is an App test: a canned contradiction appears in Analysis with two links and dismisses.

## The first real run

`.scratch/storyline-app/sample-story/EmbersOfTheVault`. The matcher alone should light `Rook's`, `the Vault`, and `Mara` across the scenes and nothing else; `hearths` stays dark, since `a4_hearths_lit` is a variable id and the read, not the matcher, would connect it. Cold City is the real test: its synopsis says the scene never mentions Rook, which names him, and the read should reject that span with a reason to that effect. Mara's Confession should yield developments about Mara and Rook that read as the scene's own summary. Then a continuity pass over the-thaw, expecting nothing, followed by one deliberate edit that kills Rook early, expecting exactly one contradiction. The rubrics are iterated against those four before anything else.

## Build order

The first three land without a runner and are useful on their own.

1. The matcher and the verdict store, with `mentionIndex`.
2. The editor plugin, tooltip, and navigation.
3. `aliases` on reference entities and the library field.
4. The runner from 15.
5. `read-scene`, the ledger, the Developments section, and alias proposals.
6. The continuity synthesis and its Analysis section.

## Deliberately left to the build

The exact edit-distance thresholds and stoplist size, iterated against the sample story; whether synopsis and beats get decorations too (they are plain fields today, and the read covers them regardless); how the tooltip behaves on touch; the ledger's on-disk format in app data; whether a rejection the model makes should be offered to the writer as a permanent verdict; cross-lane continuity (a character in two lanes in one act is not a contradiction in a game narrative, and what is needs thought); and the rubrics' precise wording.

## Build notes

Found while building, 2026-09-08, and binding on 15 as well. Claude Code 2.1.215 delivers a `--json-schema` answer through a tool of its own called StructuredOutput, so removing every tool with `--disallowedTools "*"` removes that one too: the first real ping spent five turns being refused it and came back with no `structured_output`. The runner passes `--tools StructuredOutput` instead, which leaves the model that tool and no other; the same ping then takes two turns and about a fifth of a cent. There is no `--max-turns` in this version, and with one tool there is nothing to bound. The npm install of Claude Code on Windows is a `claude.cmd` that runs `node_modules/@anthropic-ai/claude-code/bin/claude.exe`; both spawners run that exe directly (or the older `cli.js` through node) so no shell rereads the argv, which carries a JSON schema and a rubric. Verdict keys are `kind:id` for the item and the entity both.

Three more from the build, all six steps landed on `feature/mentions-and-scene-read` the same day. The ledger lives in the page's own storage (localStorage, keyed by story name) on both platforms rather than a file under app data: WebView2 keeps that storage under the app data directory anyway, and one store means one code path. Continuity findings are their own `ContinuityFinding` shape, pending in App state and rendered by the Analysis view under a Continuity heading with a dismiss, rather than a new kind on the static `Finding`; the sidebar count adds them. The Read button on a scene or note reads regardless of the hash, since the writer asked; the read after a save and the whole-story pass respect it. An alias is proposed only for a phrase the read resolved in two or more items, so a one-off epithet stays a mention and not a name.

Patrick's first look, 2026-09-08: the cards were not useful enough. Three additions the same day. A mention is a link: Ctrl+click follows it, and the card's title is the link otherwise. The card has an Expand that opens the whole page in place — its text as paragraphs, tags and aliases, every development recorded about it with links to the scenes, and every item that names it as links — and pins the card while it is open. The card shows the page's mood board: up to three thumbnails collapsed, all of them expanded. And the reverse direction is on the page itself now: a Named in panel on library pages, notes, and scenes lists everything that names them, grouped by kind, each a link — the notebook reaches the library and the library reaches back.

Same day, three more from Patrick. Tags and aliases on a library page are pills: type one, Enter (or a comma) adds it, × or Backspace on an empty box removes one; the read's proposals sit after them as dashed ghosts. Library pages have the Read button the notes had, a save on one is followed by a read, and the whole-story pass covers them after the notes. And the continuity check was too thin: it saw only the ledger and the variable state. Its briefing now carries the world first — the library pages for whatever the lane's scenes name (by the characters field, the matcher, or a read) and the notes that name any of those or any of the lane's scenes, most-named first, each clipped to a budget — then each scene with its synopsis and beats and either its developments or, unread, its prose. The rubric counts a scene against the library and notes as a contradiction, with a page read as a reference that a scene may correct rather than a fact that a scene may not touch.

Patrick's first real read, 2026-09-08: fifty seconds and an empty answer, with 4,562 output tokens behind it. Claude Code thinks before it answers unless told not to, and the thinking budget is what those tokens and seconds were. Both spawners now set `MAX_THINKING_TOKENS=0` in the process environment. Measured on the ping: 161 output tokens down to 61. Measured on the spec's first real read, Mara's Confession from the sample story: 4.9 seconds, 307 output tokens, half a cent, three developments about Mara each with its quote, no mentions because every name was already matched. One quote came back lightly reworded rather than verbatim; the rubric asks for verbatim and Haiku mostly obliges.

Patrick's third look, the same day: "1 phrase resolved" was bookkeeping showing its face, and what he wanted from Read was the editor of issue 11 — a page checked against the world, loose ends, state that wants a variable, and, above all, anything the page treats as part of the story that the story does not yet hold as a first-class thing. So the read now returns editor's notes on top of the bookkeeping: continuity, loose-end, define, other, each one sentence with its quote. A define note names the thing as written and says what it should be — character, place, lore, scene, note, or variable (with the variable proposed) — and the names of things that do not exist yet are drawn in orange in the prose wherever they appear; the card on one creates the thing with that name in a click, or rules that it is nothing. Nothing deterministic decides what is a thing: an earlier pass that flagged capitalised words was taken out on his correction, since "the swamp" and "port town" are places all the same. The notes list on the page under Read with their one-click fixes (declare the variable, add the character to the scene, create the page), and in the Coach view page by page. The briefing for a read now carries the world the page touches — the pages it names, the notes that bear on it, the scene's engine, the whole registry — so the notes have something to check against.

Two more the same evening. Claude Code's session limit came back as a 429 inside a successful exit, and "Read every changed scene" walked every scene into it. The runner now knows a limit when it sees one (`RunnerFailure.limit`, from the 429 or the wording), the app stops any whole-story pass at the first, shows one standing notice with Claude Code's own sentence and the reset time, and holds every read and check until the writer dismisses it or a later run gets through. And the tagging mechanism from issue 14 was never built: a tag is now written in one canonical form (lower case, hyphens, letters and digits only), folds into the story's existing spelling when it is a case or plural variant of one, and the story's tags are offered as the writer types. That is the write-time half of 14; the Tags view with rename and merge is still to come.

Patrick's Great Owls test: he expected a read of the owls' page to note that the Owl Leader, who is named in the Aves scenes and nowhere on the page, has no page. A page's briefing never carried scenes, so it could not. Now a library page or note is briefed with the scenes and notes that name it (the reverse index, most-named first, six at most, clipped) and told to read them for the page's subject; and every read is briefed with the things other reads already said the story lacks, so it connects a name flagged on one page to the page it belongs to instead of flagging it fresh. The limit that remains is the index itself: the owls' scenes reach the owls' page only if they name it by its title or an alias, so "the owls" wants to be on the page's Also called before the read can follow it.

The Keepers, 2026-09-08: a read flagged the Keepers as undefined while a lore page called The Keepers stood in the library. The page says "the Keeper role"; the matcher knew the title only whole, so the page never entered the read's world section and the model, reading a roster line, missed it. Two fixes. The matcher now derives a title's variants — without its article, and with its last word in the other number — so "the Keeper role" and "Keepers" name The Keepers, "Great Owl" names The Great Owls, and a note called Cities is named by "City"; derived from the title, never guessed. And a define note about a name the story already has is dropped before it reaches the ledger, whatever the page is called. On Patrick's rule, nothing in a note or a card says a thing wants, needs, or should have a page: a define note reads "The Keepers: mentioned, but no lore page describes it", the card on an orange name reads "Kal'ewei is mentioned, but nothing in the story describes it. Suggested: a place.", and the rubric says so in as many words.

Patrick's next round, the same evening: the read's failure text showed on every page, the elapsed count restarted when a page was reopened, and a two-minute stop said nothing about why. Claude Code can stream its work (`--output-format stream-json --verbose --include-partial-messages`): an init event when it connects, a block start naming what it is doing, thinking or writing, deltas with the characters as they come, the result last. Both spawners now forward each line as it is printed — the shell emits a `claude-line` event per line, the helper answers one JSON object per line — and one parser in claudeCode.ts folds them into a phase and a count the button shows: "Reading… thinking 21s · 1,200 chars". The fixed stop is gone; a run that says nothing for three minutes is stopped, with the phase it went quiet in. Failures are per page, and the count runs from the app's start time.

Patrick's read of a note in Uyuni, the same evening: continuity notes that were topics ("The Keepers' burden and natural succession"), a "not listed on the scene" note on a note, and developments with no heading. The note's shape is now demanded rather than hoped for. Every note is one full sentence saying what is the case (fewer than five words is dropped), with the quote on this page, and a separate suggestion saying what the writer could do, starting with a verb. A continuity note must carry its other end — the page or scene it clashes with, by key, and that page's sentence — or it is dropped; the card shows "against The Keepers ↗: …" with a link. A "not listed on the scene" note only survives on a scene. The block under Read has headings, Editor's notes and Developments.

"1 name refused" said nothing about which name: the summary now says "ruled out", and the block under Read lists each one — the phrase, the thing the read says it is not here, its reason — with an "It is X" that keeps it after all as a writer's verdict. And Patrick's raven king: a loose-end note that "the raven king" refers to King Naviro was the read filing a mention under the wrong heading. The rubric now says a phrase that means a roster thing under another name is a mention with that key, never a note; unconfirmed mentions are drawn in orange like the unknowns; and the card on one offers the connections in his words — confirm it, keep the phrase as a name for the thing (an alias written onto the page from wherever the writer is), pick something else that exists from a searchable roster, create something new, or say it is nothing. The orange-name card gets the same picker.

## Evals

`pnpm eval:coach` runs the real reads against invented fixtures under `evals/` (never a writer's own story) with stated expectations, N times each, and reports a pass rate; it spends usage and never runs with `pnpm test`. First haiku baseline, 2026-09-08, ten runs per case:

| expectation | haiku |
|---|---|
| Mara's Confession: defines the Warden | 10/10 |
| Mara's Confession: a development about Mara | 9/10 |
| Mara's Confession: does not define Mara, Rook, the Vault | 10/10 |
| Salt queen: resolves "the salt queen" to Queen Ilsabet as a mention | 0/10 |
| Salt queen: does not flag the salt queen as undefined | 10/10 |
| Salt queen: defines the Drowned Choir | 10/10 |
| Tide Bell: defines Brother Halvard (character) | 8/10 |
| Tide Bell: defines the Glasswater marsh (place) | 7/10 |
| Tide Bell: defines the Rite of Brine (lore) | 10/10 |
| Tide Bell: proposes a variable for the bell or the closed crossing | 0/10 |
| Tide Bell: does not define Teodor or Marrow Point | 10/10 |

The two zeros are the same failure: a job buried in a field the model does not use. It knows the salt queen is Ilsabet (a loose-end note in run 4 says so, and it never defines her as missing) and never writes it under mentions; the mentions it does write are "what the page is about" ("the girl" → the note itself). And it never proposes a variable, though the scene says in words that a rung bell closes the crossing; the proposal is a clause inside the define paragraph. Missing characters, places, and lore, and the rule against defining what exists, are reliable.

