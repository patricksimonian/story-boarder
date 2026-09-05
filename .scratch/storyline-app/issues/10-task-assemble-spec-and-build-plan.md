# 10 — Task: assemble the spec and stage the build

Type: task
Status: resolved
Blocked by: 08, 09

## Question

Pull every resolved decision ([04](04-grilling-mvp-feature-set.md) scope, [05](05-grilling-domain-model-and-file-format.md) domain model + on-disk schema, [06](06-grilling-platform-and-stack.md) platform/stack/sync, [09](09-grilling-versioning-and-backup.md) versioning details, [08](08-prototype-board-and-editor.md) prototype reactions, plus the four research files) into `.scratch/storyline-app/spec.md` — one build-ready document.

Then propose the **staging order** for the build (the scope is Plottr-meets-Twine scale; what lands first matters). Suggested shape to pressure-test: 1 core model + file I/O + board, 2 scene editor (synopsis/beats/prose), 3 storylines/acts/pool + graph view, 4 conditions engine + simulation, 5 GitHub sync, 6 import/export, 7 panels/images/search/templates/stats. Patrick approves the spec and order; building then proceeds as its own effort (e.g. `/tdd` per stage).

Resolving this ticket clears the map — the way to the destination is fully charted.

## Spec assembled (2026-08-26) — awaiting Patrick's approval

[spec.md](../spec.md) is written: purpose/principles, domain model, on-disk format, platform/architecture, never-lose-writing model, conditions engine, UI (per the approved prototype), interchange, flexibility features, and the staging order.

Staging order proposed (§10 of the spec): the ticket's suggested shape held under pressure, with two adjustments — the keystroke-journal + atomic-autosave layers moved forward into stage 2 with the editor (the never-lose promise can't wait for the git stage), and a stage 0 added for repo bootstrap + capturing the prototype to its throwaway branch. Order: 0 bootstrap · 1 model + file I/O + board · 2 editor + safety layers · 3 structure + graph · 4 engine + simulation · 5 history + GitHub sync · 6 import/export · 7 flexibility features. Engine deliberately lands before sync (local writing is already safe by stage 2); the swap is dependency-free if Patrick prefers remote backup sooner.

On Patrick's approval: mark this ticket resolved, add the decision line to the map, and start Stage 0 as its own effort (`/tdd` per stage).

## Resolution (2026-08-26)

Patrick approved the spec and the staging order ("looks good"). One process note along the way: he declined to review the first machine-styled draft, which produced the project-wide writing rule now in [/CLAUDE.md](../../../CLAUDE.md) — the spec was rewritten under it before approval. The map is clear; building proceeds per [spec.md](../spec.md) §"How the build is staged", starting at Stage 0.
