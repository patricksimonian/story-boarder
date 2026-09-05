# Storyline App

A local-first web application for authoring a video game's story — structure, prose, characters, world, and a declarative conditions engine — stored as files the author owns.

## Language

### Story structure

**Story**:
The whole project — everything authored for one game's narrative.
_Avoid_: Project (reserved for the on-disk folder), narrative

**Scene**:
The atomic authorable unit: an encapsulated stretch of story in one time and place, holding a synopsis, prose (including dialogue), beats, and attachments. A scene may sit in storylines, branch-link to other scenes, carry conditions and effects, or float loose in the idea pool — placement is an attachment, never a type change.
_Avoid_: Card, node, passage, piece

**Beat**:
The smallest unit of story change — a single shift (decision, revelation, reversal). Beats live as an ordered list inside a scene.
_Avoid_: Moment, bullet

**Storyline**:
An ordered sequence of scenes tracing one thread of the story — the main storyline or any secondary arc. Rendered as a colored lane on the board.
_Avoid_: Spine, plotline, lane, thread

**Act**:
A time-grouping shared across storylines, so lanes stay aligned. Rendered as columns on the board.
_Avoid_: Chapter, part

**Idea pool**:
Where scenes live when they belong to no storyline — fully-written, tagged, linked, and unplaced, forever if desired.
_Avoid_: Scrap pile, backlog

**Note**:
A freeform page of unstructured writing — the story's notebook. Notes belong to the story, never to a scene, and live one Markdown file each in `notes/`.
_Avoid_: Scratchpad (the feature's nickname, never the entity), memo, jotting

**Section**:
The named group a note sits under, carried as frontmatter. Sections nest by path (`research/factions`); regrouping edits a line and never moves a file; explicitly created ones persist in story.json settings, so an empty section survives a reload. A note without one is unsorted.
_Avoid_: Folder, notebook, category

**Storylet**:
Not an entity — the usage pattern of a loose scene carrying conditions, in the quality-based-narrative tradition.

### Conditions engine

**Variable**:
A typed value (boolean, number, or enum) declared in the story's registry, tracking world or player state. Only registered variables exist.
_Avoid_: Flag (a boolean variable is still a Variable), stat, quality

**Condition**:
A boolean expression over variables that gates when a scene can fire or a choice is available. Attaches to scenes and to choices — never to beats.
_Avoid_: Requirement, prerequisite, trigger

**Effect**:
A declarative variable change applied when a scene fires or a choice is taken. May cite a beat as its narrative anchor; the engine still applies it at scene granularity.
_Avoid_: Mutation, setter, consequence

**Choice**:
A directed link from one scene to another that the player (or simulation) takes, optionally gated by a condition, applying effects, and optionally weighted by chance.
_Avoid_: Branch link, edge, transition

**Chance**:
A declarative weight on a choice or loose scene, making selection probabilistic.
_Avoid_: Random, roll

**Playthrough**:
One saved walk through the story — the choices made and the variable state at each step — kept as a named test case for the simulation.
_Avoid_: Run, session, save

### Storage

**Story folder**:
The user-chosen local folder holding the entire story as plain files — always the source of truth.
_Avoid_: Workspace, project directory, vault

**Sync**:
Background reconciliation of the story folder with the user's own GitHub remote; every save is a commit.
_Avoid_: Backup, upload, cloud save
