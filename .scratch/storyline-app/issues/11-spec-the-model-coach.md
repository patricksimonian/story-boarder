# 11 — Spec: the model coach

Type: spec
Status: specified 2026-09-02 (Patrick's calls + research); revised twice same day — UI-triggered with bounded-context retrieval, then workflow orchestration with zero writes and human-in-the-loop. Build not yet scheduled, and [12](12-spec-the-home-dashboard.md) comes first.

## What it is

A review of the author's own scenes and notes that suggests **structure, never content**: state worth tracking as a variable ("this prose implies a count the story will want to test"), and structural moves ("this part reads like its own scene, joined to that one"). It fires from a button **in the app, on any item** — a scene, a note, a library page — and runs through **Claude's agent tooling on the author's machine** using the Claude Code auth he already has: no API key plumbing in the app, no vendor cloud. The story stays 100% human-written; the coach organizes and structures, and **it never mutates content**. AI-generated prose is explicitly out: no drafting, no rewriting, no filling in.

The research behind this is [research/ai-authoring-review.md](../research/ai-authoring-review.md). Its headline: no shipped tool does this. Critique exists (Sudowrite's margin comments), extraction exists (Fictionary, Novelcrafter's user-triggered codex Extract), state-from-prose inference exists in research (OpenPI, Story2Game) — but AI-initiated suggestions of author-owned state from a human draft is unclaimed territory. Emily Short named the manual state-bookkeeping burden as quality-based narrative's tooling gap in 2016; it is still open.

## Patrick's calls (2026-09-02)

1. **Local, via Claude Code.** Not bring-your-own-API-key from the browser — the coach uses the Claude Code auth he already has. The story folder is plain files; the coach reads it in place.
2. **Review only.** The coach reviews existing content and suggests variables and structure changes (including scene splits/joins). It never writes or edits story prose. "AI generated content is garbage. I want this to be 100% human created and crafted and AI help organize and structure."
3. **UI-triggered, context-bounded** (revision, same day): the coach fires on a button click on any item — no terminal in the writing loop — and it must not blow the context window as the story grows large. It gathers the *relevant* storylines, notes, and journal of the item under review: a retrieval workflow, not a folder-dump.
4. **Workflow over free multi-agent, human in the loop, zero writes** (second revision, same day): orchestration is a *workflow* — deterministic stages the app scripts — not a swarm of agents deciding among themselves; the coach must be able to take in the whole storyboard robustly; and the coach **writes nothing, ever** — its only output is *suggested* changes to story state, each applied by the human through the app's ordinary mutations or not at all.

## The architecture that follows

A browser page cannot spawn a process, so one small local piece sits between the button and the model: the **coach companion**, a Node process built on the Claude Agent SDK, started once in the story folder (`npx` today; folded into the app itself if the planned Tauri wrap ever lands — the adapter seam was built for exactly this kind of swap). It listens on localhost; the Coach view detects it and shows connected-or-not; it authenticates as the user's own Claude Code. **The companion is read-only, full stop** — its folder toolset has no write, and its findings come back in the response, not on disk:

- Every scene editor, note page, and library page carries an **"Ask the coach"** button. The click POSTs a review request — the item's identity plus the app-computed briefing (below) — to the companion; progress and the finished suggestions stream back over the same connection.
- The app holds the returned suggestions as **pending state** in the Coach view's Review section. Nothing exists on disk until the human accepts a suggestion, and acceptance flows through the app's ordinary mutations (declare a variable via the registry save, exactly as if typed by hand) — so the journal, atomic saves, boundary commits, and history see a human edit like any other. Dismissal just drops the pending entry.
- Suggestions the human hasn't decided on are ephemeral (kept per story in browser storage at most): rerunning the coach is cheap, and pending machine output is not part of the story folder. The story folder only ever contains what the human confirmed.

## Context discipline — the two layers

The window must stay bounded however large the story grows. Two layers do it:

**Layer one — the deterministic briefing, computed by the app.** The app knows the structure cold and assembles the relevant slice before the model sees anything: the target item in full; its lane neighbors from story.json (the scenes before and after it in every storyline it sits in); the variables it touches and — via the usage ledger (`src/engine/usage.ts`) — every other site that reads or writes those same variables, which is cross-arc relevance *computed*, not guessed; the registry with descriptions; and a full-text pass (`src/search/search.ts`) for the item's title and characters across the notebook. Bounded regardless of story size.

**Layer two — agentic retrieval.** The companion also hands the model a compact index — every scene's id, title, act, and lanes, titles only, cheap even at hundreds of scenes — and **read-only tools over the story folder**. When the briefing isn't enough (the review wants the scene two acts later that reads the same variable), the model pulls that one file. Context grows with relevance, never with story size.

**Wider scopes are a scripted workflow, and they are in scope.** "Review this storyline" and "review the whole storyboard" run as deterministic stages the companion orchestrates — not agents negotiating with each other, a script: (1) per-scene passes, each with its own bounded briefing, emitting per-scene findings; (2) a synthesis pass whose input is the compact index plus the per-scene *findings* (not the scenes), emitting the whole-story suggestions. Workflow over free multi-agent is a decision, not a default: deterministic stages are reproducible, individually context-bounded, individually resumable, and their cost scales visibly with story size — a linear number of small windows instead of one impossible window or an unpredictable swarm. Per-item review is the same machinery with one stage.

## Suggestion shapes

The suggestion payload carries a list of:

- **`variable`** — proposed id, type, initial, and `description` (the registry's new field earns its keep), with `because`: the author's own sentence quoted verbatim as evidence, plus the file it came from; optionally `proposedEffects` / `proposedConditions` as expression strings with the scenes they'd sit on. **Accept** declares the variable through the ordinary registry mutation (and nothing else — proposed effects/conditions are shown as next steps, not applied). **Dismiss** drops the pending entry.
- **`structure`** — a described move in plain words ("the goblin scene's two beats are choices; the squirrel moment wants to be its own gated scene before the clearing"), with the scenes/notes it concerns as open-in-app links. Structure suggestions are **advice only** — no accept button applies them; the writer makes the move by hand in the ordinary views.

Restraint is a stated requirement in the skill, not a hope: at most a handful of high-confidence suggestions per run, each grounded in a verbatim quote — the OpenPI salience lesson (naive extraction proposes fifty variables per scene) written into the rubric.

## Rules the rubric enforces on the coach

- Never write anything, anywhere — the companion's toolset is read-only by construction, not by promise; the only output is the suggestion payload in the response.
- Never draft, rewrite, or extend story prose — not even examples. Proposed variable names and descriptions are metadata, not story content.
- Every suggestion quotes the author verbatim as its evidence.
- Suggest in the author's own vocabulary (the glossary in CONTEXT.md travels with the rubric).
- Prefer the app's established patterns (counter-and-gate, variant scene, cross-arc read, time-as-enum, boolean-per-plot-item, storylet pool) when naming what a suggestion is an instance of.

## Precedents inherited

- The **Twine lift dialog**: suggestions checked by default, applied only on say-so, never silent conversion — the industry-wide stance the research confirmed (every surveyed tool that touches author structure proposes and confirms).
- The **PAT flow**: user-owned credentials, pasted once — here made unnecessary entirely, since Claude Code brings its own auth.
- **Disclosure in docs, not dialogs** (Obsidian's developer policies, Zed's data-flow statements): the Coach view's install text says plainly that running `/coach` sends the folder's text to Anthropic via the author's own Claude Code session, and nowhere else.

## Deliberately left to the build stage

The exact suggestion-payload schema and its version field; whether accepted suggestions leave a trace ("declared from coach suggestion" in the variable description); the companion's port/handshake details, how the Coach view explains starting it, and how a long whole-story workflow reports progress and survives interruption; the briefing's exact size budget and what the read-only toolset exposes; and the rubric's precise wording, which deserves iteration against Uyuni itself — the first real test case is `notes/forest-events.md`, which contains a complete variable design in prose and should yield exactly one suggestion.
