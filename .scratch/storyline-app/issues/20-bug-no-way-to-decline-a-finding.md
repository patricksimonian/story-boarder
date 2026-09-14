# 20 — Bug: no way to decline a finding so it stays gone

Type: bug
Status: reported by Patrick 2026-09-13, not yet scoped. Belongs to the read from [17](17-spec-mentions-and-the-scene-read.md); overlaps [19](19-bug-variable-proposals-repeat-across-reads.md), whose last question is the same one.

## What Patrick saw

An editor's note or a finding the writer disagrees with can't be turned down. It comes back on the next read as if it were new.

## What the code does today

Three things can be refused, in three different ways, and none of them covers the read's notes. An orange name in the prose can be ruled "nothing" from its tooltip, which writes a verdict with a null entity into `mentions.json` and holds across reads. A continuity finding in Analysis has a Dismiss, but the list lives in component state and is gone when the story is left. An alias proposal in the library can be dismissed the same way, in memory only. The editor's notes in the read panel and in the Coach view have no control at all: they are whatever the last read said, replaced whole on the next read of that page, and a page that hasn't changed isn't re-read, so the note sits there until the writer edits the page and the read raises it again.

## What would settle it

One decline that means "not this, on this page", kept in the story folder the way mention rulings are, and honoured by the read the way rulings are: the briefing tells the model what the writer already refused, and the ledger drops a note that matches a refusal even when the model repeats it. Continuity findings and alias proposals could use the same store. What a refusal is keyed on wants deciding: a define note by the name, a variable proposal by its id, a continuity or loose-end note by its quote.
