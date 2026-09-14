# 19 — Bug: variable proposals repeat across reads

Type: bug
Status: reported by Patrick 2026-09-13, not yet reproduced or scoped. He hasn't tested it enough to be sure; logged so it isn't lost. Belongs to the read from [17](17-spec-mentions-and-the-scene-read.md).

## What Patrick saw

Successive reads of the same story propose variables that look like duplicates of each other, or of variables the registry already has under a slightly different name. Nothing seems to check a proposal against what exists nearby, and nothing remembers that an earlier proposal was dealt with, so a later read raises it fresh.

## What the code does today

`ledgerEntryFrom` in `src/assistant/readScene.ts` drops a proposal only when its exact id, or the name the read gave it, is already a variable in the dictionary. `dalia_fatigue` beside `dalia_fatigue_level` passes. Two proposals within one read with the same id are folded into one; two proposals across two reads are not compared at all, because every read replaces its item's ledger entry from the current text alone. The briefing gives the read the whole registry, so a proposal that duplicates a declared variable is the model ignoring what it was shown; a proposal that duplicates another page's proposal has no way to know, since the briefing lists other reads' missing pages ("Things other reads said the story lacks") but not their proposed variables.

There is no record of a note's fate. Declaring the variable makes the note read as done, because `defineDone` in `src/App.tsx` looks the id up in the registry. Dismissing a proposal, or declaring the same state under a different name, leaves nothing behind, and the next read of any page that touches that state proposes it again.

## What would settle it

Reproduce first: two reads of one scene, then reads of two scenes that share state, and look at the ledger entries for the ids proposed. Then decide three things. Whether a proposal should be checked against the registry by something looser than the exact id (the same words in a different order, one a prefix of the other, the same description). Whether the briefing should carry the variables other reads proposed, the way it carries the pages they said were missing. And whether the writer's answer to a proposal ("not a variable", "that's `trust`") should be kept as a verdict the way mention rulings are in `mentions.json`, so no read raises it twice.
