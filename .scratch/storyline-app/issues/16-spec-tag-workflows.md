# 16 — Spec: tag workflows

Type: spec
Status: specified 2026-09-05 (Patrick's ask; second piece of the dynamic-coaching epic). Needs [14](14-spec-tags-on-everything.md) for the vocabulary and [15](15-spec-the-assistant-runner.md) for the runner.

## The ask

Two things a model is good at and a rule is not: reading a scene and saying which of the story's tags belong on it, and looking at a vocabulary and saying which tags mean the same thing. Both are suggestions; the writer applies or drops each one.

## Workflow: `suggest-tags`

**Target:** any entity that takes tags, so a scene, a note, a library page, or a variable.

**Briefing,** built by `brief(story, target)` and nothing else. The target in full: title, and for a scene its synopsis, beats, and prose, for a note or library page its body, for a variable its description and the ids of every scene that reads or writes it (from the usage ledger). The target's current tags. The vocabulary from `tagIndex`: every tag with its count, its description if one is set, and the titles of up to three carriers, so `dark-forest (7): Cold open at the market, The clearing, ...` tells the model what the tag has meant so far. The names of the story's library pages grouped by kind, so a character or a place is recognised as such. The tags of the target's neighbours: for a scene, the scenes before and after it in each storyline it sits in; for a note, the notes in its section. That is the whole briefing, and it is bounded by the vocabulary's size and the target's length, never by the story's.

**Rubric,** the fixed part. Prefer an existing tag over a new one every time one fits. Propose a new tag only when nothing in the vocabulary covers the idea and the idea plausibly applies to more than this one item, and say why in a sentence. Never propose a character's or place's name as a tag when the story has a library page for it; a scene names its characters in its own field. At most five suggestions, and fewer is better. Every suggestion quotes the target verbatim as evidence. Use the story's own words: the rubric carries the glossary from CONTEXT.md.

**Schema:**

```json
{ "suggestions": [ { "tag": "dark-forest", "existing": true, "because": "the verbatim quote", "why": "one sentence, only for a new tag" } ] }
```

Tier: `small`. Patrick's call, and the right one: this is classification against a known list.

**In the app.** A **Suggest tags** button beside every tag field. While it runs the field shows a spinner and the button becomes Cancel. Suggestions arrive as ghost chips at the end of the field, dimmed, each with a tick and a ×; hovering shows the quote. Tick adds the tag through the same edit the writer's own typing would make, after canonicalization, and a new tag is added to the vocabulary by that edit alone. × drops it. Nothing lands on disk from the suggestion itself. Ghost chips are per-story memory and vanish on reload, like the pending state in [15](15-spec-the-assistant-runner.md).

## Workflow: `reconcile-tags`

**Target:** the vocabulary. No prose reaches the model; the briefing is `tagIndex` as above (tag, count, description, three carrier titles), plus the alias table from `settings.tags` so already-merged names are not proposed again. [14](14-spec-tags-on-everything.md) has already caught the mechanical duplicates before this runs, so the model sees only the semantic question: `betrayal` and `treachery`, `market` and `bazaar`.

**Rubric.** Propose a merge only when the two tags are used for the same idea, judged from their carriers, not from the words alone; two tags that look alike but carry different scenes stay apart. Say which to keep, preferring the more used one unless the other is the better word. Also propose a one-line description for any tag that has none, written from its carriers.

**Schema:**

```json
{ "merges": [ { "keep": "betrayal", "fold": ["treachery"], "because": "one sentence" } ],
  "descriptions": [ { "tag": "dark-forest", "description": "one line" } ] }
```

Tier: `small`.

**In the app.** A **Reconcile** button at the top of the Tags view. Merge proposals appear above the mechanical duplicates, each with a merge button that runs the rename-and-alias mutation from 14, and a dismiss. Description proposals appear inline beside the tag with the same tick and ×.

## Wider scopes

**Suggest tags for everything untagged** is the same `suggest-tags` workflow run once per untagged entity, in sequence, with a progress line and a Cancel that stops after the current item. Results pool as ghost chips on their fields and as a count in the Tags view. One item at a time keeps each request bounded and lets the writer accept early results while later ones are still running; this is the per-item stage of 11's scripted workflows with no synthesis stage, because tags need none.

## Restraint, and what the writer is told

Both rubrics say what 11 says: a handful of high-confidence suggestions, each grounded in a quote, in the story's own vocabulary. The Coach view's disclosure from 15 already covers what leaves the machine; the tag field's button carries a title attribute saying the same in one line.

## Tests

Briefing builders are pure: for the sample story, assert the vocabulary appears with counts and carriers, that a scene's neighbours' tags appear, that a variable's briefing lists its readers and writers, and that the whole briefing for the largest sample scene is under a stated size. Accepting a suggestion is an App test with `StubRunner`: canned suggestions arrive, tick one, assert the file on disk now carries the canonical tag and the ghost chip is gone. Reconcile: canned merges, one accepted, assert every carrier rewritten and the alias recorded.

## The first real run

`.scratch/storyline-app/sample-story/EmbersOfTheVault`. Run `suggest-tags` on its notes and expect existing tags preferred and no character names proposed; run `reconcile-tags` on its vocabulary and expect nothing, or one merge with a reason that reads true. The rubrics are iterated against that before anything else.

## Deliberately left to the build

Whether ghost chips also show in the pool drawer and act view, where tags render but are not edited. Whether a variable's suggestions draw on the prose of its reader scenes or only on their titles. Whether an accepted new tag should get a description proposed in the same run.
