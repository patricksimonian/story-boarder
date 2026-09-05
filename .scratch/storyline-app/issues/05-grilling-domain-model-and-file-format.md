# 05 — Domain modeling: the story's data model and on-disk format

Type: grilling
Status: resolved
Blocked by: 01, 03, 04

## Question

Given the confirmed feature set ([04](04-grilling-mvp-feature-set.md)): what are the domain entities (Story, Act, Beat, Plotline, Character, Location, storylets/idea-pool pieces — plus the conditions-engine entities: Variable registry, conditions, effects, saved Playthroughs), how do they relate, and exactly how is it all laid out on disk in the user-chosen folder (including where sketches/images live)?

Use `/domain-modeling`. Decide:

- The ubiquitous language — what each thing is called in the app and in the files.
- The file layout (one file per scene? per character? a folder structure?) and format, informed by research [03](03-research-local-first-storage-options.md).
- How the app finds the content folder (settings? picked on launch?) and what happens when files are edited outside the app.

Output: a domain model + on-disk schema section for the spec.

## Answer

Decided with Patrick (2026-08-26). The ubiquitous language lives in [/CONTEXT.md](../../../CONTEXT.md) — glossary is canonical there; this answer holds the structural and on-disk decisions.

**Entity model:**
- **Scene** is the atomic unit — an encapsulated stretch of story holding synopsis, ordered **Beats** (smallest units of change — Patrick chose beats as real sub-entities, industry term), prose incl. dialogue, and attachments. Placement is an attachment, never a type change: a scene may sit in storylines, branch via **Choices**, carry conditions/effects, or float in the **idea pool**. "Storylet" = loose scene with conditions (a pattern, not a type).
- **Storyline** replaces both "spine" and "plotline" (Patrick rejected those terms): an ordered sequence of scenes; main + any number of secondary arcs; a scene may belong to **multiple storylines**. **Acts** are time-groupings shared across storylines (board columns).
- Characters, Places, Lore docs are reference entities linked from scenes/beats by slug.

**Engine attachment:** conditions, effects, chance, and choices attach at **scene granularity only** — a mid-scene choice means the scene splits there (a choice structurally ends a scene). An effect may *cite* a beat as its narrative anchor for bookkeeping; evaluation stays scene-level. Expressions are written as readable strings (`trust >= 3 and not mara_dead`) in files, parsed to the typed eval-free AST ([research 07](07-research-interchange-formats.md)) at load; same interpreter serves simulation and playable export.

**On-disk schema** (folder = the story; self-identifying via `story.json`):
```
MyStory/
├── story.json          ← manifest: title, acts, storylines (names/colors/scene order), settings
├── scenes/<slug>.md    ← YAML frontmatter (id, storylines, act, tags, characters,
│                          condition, effects, choices) + body: ## Synopsis / ## Beats / ## Prose
├── characters/<slug>.md
├── places/<slug>.md
├── lore/<slug>.md
├── variables.json      ← typed variable registry
├── playthroughs/<name>.json
└── assets/             ← images; sketches saved as PNG/SVG
```
Load-bearing choices: one file per prose entity (git-friendly, Notepad-readable); **order lives in `story.json`**, never in filenames; **ids are slugs** — stable after creation, renames change display title only.

**Folder behavior:** picker on first launch, recent-stories list after; any folder containing a valid `story.json` opens. **Disk is the source of truth**: the app watches the folder and live-reloads external edits. Sole conflict case (file changed on disk while the same file has unsaved in-app edits) → side-by-side view, user picks or merges; no silent clobbering in either direction. Malformed files are flagged and raw-editable in-app, never dropped or silently repaired.
