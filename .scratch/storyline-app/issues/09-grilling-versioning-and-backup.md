# 09 — Grilling: versioning and backup of story files

Type: grilling
Status: resolved
Blocked by: 06

## Question

The story is plain files with disk as source of truth ([05](05-grilling-domain-model-and-file-format.md)) — how is it kept safe over time?

Largely pre-answered by [06](06-grilling-platform-and-stack.md): the folder is a git repo, the app commits on save and syncs to Patrick's GitHub remote via the REST API. Remaining decisions: commit cadence (literally every save, or debounced/session commits?), commit message shape, whether v1 ships an in-app history view (browse/restore old versions of a scene) or defers to GitHub's UI, and behavior when the remote is unreachable (queue and retry — confirm). Decide these and state the app's promise about never losing writing.

## Answer

Decided with Patrick (2026-08-26).

**Three-layer never-lose-writing model** (the third layer is Patrick's addition):
1. **Scratch journal** — every keystroke lands in a browser-local write-ahead journal (IndexedDB) within milliseconds. On launch, if the journal is ahead of disk (crash/power loss), the app reconciles: auto-apply if the disk file is untouched since journaling, side-by-side view if not. Cleared only after confirmed disk write; invisible plumbing.
2. **Disk auto-save** — flush to the story folder ~1s after typing pauses, using atomic writes (temp file + rename) so a power cut can never half-corrupt a file.
3. **Commits at natural boundaries** — the app commits on scene close/switch or a few minutes of idle, with generated messages summarizing the change ("Edit scene: Mara Finds the Letter — prose +240 words, 2 beats added"). A manual **checkpoint** action commits anytime with a custom message. (Chosen over per-save commits — keystroke-noise history — and manual-only.)

**Git/sync details**: real local git repo via embedded JS git (commits fully offline; sync mirrors to the GitHub remote over REST when online, catching up after offline stretches). Push follows each commit automatically when online. Pull-first when the remote is ahead (another machine); overlaps surface in the standard side-by-side view. The remote is **never force-pushed**. Per-scene history (view/restore any prior version) lives in-app; whole-repo browsing defers to GitHub's UI.
