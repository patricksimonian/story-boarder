# 12 — Spec: the home dashboard

Type: spec
Status: specified 2026-09-02 (Patrick's ask, same session as [11](11-spec-the-model-coach.md)); scheduled ahead of the model coach — "prior to all of that a critical feature missing"

## The gap

Once a folder is open there is no way back. The start screen — recents, the three doors into an empty folder — only exists before a story opens; after that the app has no home, no view of the writer's other storyboards, and no way to back one up locally, clone one, or rename one. The map's destination says "the storyline for their video game," singular, and v1 was honest to that; the moment there are two stories (Embers to learn in, Uyuni to write in — already true), the missing home is a daily wall.

## What it is

The start screen grows into a **home dashboard**, and the open story gets a door back to it.

- **⌂ Home** in the sidebar (landed 2026-09-04 ahead of the rest, as a plain return to the start screen): flushes any open drafts, lets the boundary commit land, releases the folder, and returns to the dashboard. Everything the app already does at close/switch, pointed at a view instead of a folder.
- **The dashboard lists every known storyboard** — the persisted recents, upgraded from a name list to cards: the story's *title* (read from story.json when the handle's permission allows; the folder name as fallback), the folder name, and last-opened. Open on click. The existing doors stay: open another folder, and for an empty folder the bare start, the templates, GitHub pull, and Twine/Plottr import.
- **Clone** ("Duplicate this storyboard…"): pick a destination folder (must be empty — the same rule as pulling from GitHub into a folder), copy every file across, open the copy. This is also the local **backup** story: "Back up to a folder…" is the same copy pointed at a backup location, alongside the backup answers that already exist (GitHub sync, and git history inside the folder). The copy walks the folder the way export's `collectSource` does — including `.git`, so a backup carries its history.
- **Rename**: the honest split. The story's **title** renames freely — it's a story.json field, editable from the dashboard card or the sidebar, and the dashboard displays titles first, so this is the rename that matters day to day. The **folder name** is the operating system's: the File System Access API cannot rename or move a user-picked directory, so the dashboard doesn't pretend to — the card can say "folder: uyuni" and the docs say renaming the folder happens in Explorer. A persisted handle generally survives an OS rename; the card follows the folder, whatever it's called.
- **Forget**: a card action to drop a storyboard from the list (the folder is untouched — this only forgets the handle).

## Decisions

- **Local backup is clone, not zip.** A copy into a user-picked folder uses machinery the app already trusts (FSA walk + write, the pull-into-empty precedent) and produces a backup that is itself an openable storyboard with its history intact. A downloadable .zip snapshot is a possible later nicety, not v1 of this ticket.
- **Permission honesty on the dashboard.** Reading titles from persisted handles may require permission that hasn't been granted this session; a card whose handle can't be read yet shows the folder name and gains its title on open — never a permission prompt storm at dashboard load.
- **Home is a view, not a reload.** Same app, no navigation; the folder is released cleanly (watcher stopped, drafts flushed, journal reconciled state left true).

## Deliberately left to the build stage

The card layout; whether last-opened shows as a date or "3 days ago"; whether clone offers a suggested "-backup" naming hint; what happens when a listed folder has vanished from disk (show the card with a "missing" note and offer Forget, presumably); and whether ⌂ Home lives above or below the story title in the sidebar.
