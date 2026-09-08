# 14 — Spec: tags on everything, and keeping them honest

Type: spec
Status: specified 2026-09-05 (Patrick's ask). Prerequisite for [15](15-spec-the-assistant-runner.md) and [16](16-spec-tag-workflows.md): the tag suggester needs a vocabulary it can trust before a model ever sees it.

## The ask

Tagging is only half-built. Library pages have a tags field; scenes show their tags on cards but nowhere to edit them; notes carry `tags` in their frontmatter and the app never shows it. Patrick's point is that every entity is frontmatter already, so every entity should take tags, and once they do the graph can draw connections along them. He also wants drift stopped at the source: two spellings of one idea are two tags today, and nothing notices.

## What exists

The domain and the file formats are already there. `Scene`, `Note`, and `ReferenceEntity` in `src/domain/types.ts` each carry `tags: string[]`; `sceneFile.ts`, `noteFile.ts`, and `referenceFile.ts` parse and serialize the list; search indexes it. What's missing is the writing side outside the library page, any notion of one tag being the same as another, and any view that looks at tags across the story.

## Decisions

**Every Markdown-backed entity takes tags: scenes, notes, library pages.** Variables get a `tags` list on their registry entry as well, because a variable tagged `forest` next to the scenes tagged `forest` is exactly the kind of connection the graph should draw, and it's one optional field in `registry.json`. Acts and storylines don't: they are structure, not content, and the lanes and columns already connect what they hold.

**One canonical form, applied when the tag is written.** Lowercase, trimmed, runs of whitespace and underscores folded to a single hyphen, everything else kept as typed (so `sœur` survives). `Dark Forest`, `dark_forest`, and `dark-forest` are one tag. A file that already holds a non-canonical spelling is not touched at load (loading never writes); it is reported as a problem, and the next save of that file, or one pass from the Tags view, fixes it.

**The vocabulary is derived, never registered.** `tagIndex(story)` in a new `src/tags/` module returns every tag in use with its carriers (`{ kind, id, title }`) and counts, computed from the loaded story. There is no list of allowed tags to maintain and no way for the files and the list to disagree. What `story.json` does hold, under `settings.tags`, is the optional extra a file can't carry on its own: a description and aliases, keyed by canonical tag.

```json
"tags": {
  "mara-vale": { "description": "Anything in Mara's arc, not just scenes she appears in", "aliases": ["mara", "vale"] }
}
```

An alias is a spelling the story once used. When a file carries one, the loader reports it (`mara is an alias of mara-vale`) and the Tags view fixes it in one click. Aliases exist so a merge is remembered: after `mara` folds into `mara-vale`, a note written next month with `mara` is caught, not re-created.

**Near-duplicates are detected mechanically first.** Two tags are flagged as probable duplicates when they are equal ignoring case and punctuation, when one is the plural of the other, or when they are five or more characters and one edit apart. The Tags view lists these pairs at the top. This is deterministic and cheap; the semantic cases (`betrayal` and `treachery`) are what [16](16-spec-tag-workflows.md) hands to the model.

## The tag field

One component, `TagsField`, used on the scene editor, the note page, the library page, and the variable row. It replaces the comma-separated text input on the library page. Tags render as chips; a text input at the end takes a new one, committed on Enter or comma, removed with Backspace on an empty input or the chip's ×. Typing filters the vocabulary and shows matches under the input, existing tags first, with their counts, so a writer reaching for `forest` sees `dark-forest (7)` before inventing a third spelling. A near-duplicate of an existing tag shows the existing one first with a note (`did you mean dark-forest?`); choosing the new spelling anyway is one more keystroke, never blocked. The field canonicalizes on commit.

## The Tags view

A new sidebar view, under Library. It lists every tag with its count and a description if one is set; expanding a tag lists its carriers grouped by kind, each a link into the app. Actions on a tag are **rename** (rewrites every carrier through the ordinary edit mutations, so the journal, the atomic saves, and the boundary commit see it as edits), **merge into** (rename plus the old name recorded as an alias), **describe**, and **remove everywhere**. The probable-duplicate pairs sit at the top with a merge button each way. Everything here is a human decision; nothing merges on its own.

## The graph

`GraphView` gains a connect-by control: **choices** (today's graph), **tags**, or **both**. In tags mode each tag in use becomes a hub node, and every carrier links to it, so a tag shared by twelve scenes is twelve edges to one hub rather than sixty-six between pairs. Notes, library pages, and variables enter the graph as nodes only in tags mode, in rows under the scenes, since choices never reach them. Selecting a hub highlights its carriers; clicking a carrier opens it. Layout stays derived, as `graph.ts` promises: nothing about tag edges is persisted.

The board gets the small version: clicking a tag on a scene card filters the board to carriers of that tag, cleared from the same chip in the toolbar.

## Tests

Canonicalization is a table test. `tagIndex` and the duplicate detector run on the sample story plus hand-built cases (plurals, one edit, case). Rename and merge are mutation tests that assert every carrier file was rewritten and the alias recorded. The field is tested with user-event: type, commit, suggestion order, canonical form on commit. The graph tests assert hub nodes and edge counts in tags mode and an unchanged graph in choices mode.

## Deliberately left to the build

Whether the note explorer shows tags in its tree (probably not; sections are the tree there). Whether the Tags view lives as its own sidebar entry or as a tab of Library. Whether a variable's tags render in the Variables view as chips or a column. Colour for hub nodes.
