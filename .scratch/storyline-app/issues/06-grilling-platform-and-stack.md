# 06 — Grilling: choose the app platform and stack

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

Which architecture from research [03](03-research-local-first-storage-options.md) does the app use — browser + File System Access API, Tauri/Electron desktop shell, or a local server — and what web stack sits on top?

Decide with the user:

- How they want to launch the app day-to-day (double-click an exe? run a command? open a browser tab?) — this largely picks the architecture.
- Framework and tooling for the UI, biased toward simple and maintainable-by-an-agent.
- Any constraints from the MVP feature set ([04](04-grilling-mvp-feature-set.md)) (e.g., a graph view may want a specific library).

Output: a locked stack decision for the spec and build.

## Answer

Decided with Patrick (2026-08-26), including a mid-ticket scope redraw he initiated.

**Sync model — "Option B"**: the local folder remains the source of truth exactly as [05](05-grilling-domain-model-and-file-format.md) decided; the folder is a git repo and the app is also a git client — committing on save and syncing to a **GitHub remote Patrick owns**. This amends the map's out-of-scope line: user-owned git-remote sync is in; vendor clouds, accounts, and collaboration remain out. (Option A — GitHub-as-the-store, no local folder — was considered and rejected: it kills offline writing in a writing app.)

**Platform**: **hosted static PWA** (Edge/Chrome on Windows 11), File System Access API for the folder (permission persists for an installed PWA). Because browsers can't speak raw git protocol to github.com (CORS) and a public git-CORS proxy in the write path is unacceptable, **sync goes through the GitHub REST API** — real commits and history via API calls with a fine-grained PAT pasted once. Disk writes are instant and local; sync is background. Change detection: FileSystemObserver where available, polling fallback.

**Architecture hedge**: files/git/watching sit behind thin adapter interfaces so wrapping the same codebase in **Tauri** later (real git, OS credential store, native watching) is a small step, not a rewrite.

**Stack**: TypeScript + React + Vite; React Flow for the graph view; TipTap for the prose editor.

Consequence: [09](09-grilling-versioning-and-backup.md) (versioning/backup) is largely pre-answered — every save is a commit; only cadence/history-UI details remain.
