# 18 — Spec: Settings, and the coaching switch

Type: spec
Status: specified 2026-09-08 from Patrick's UX, in his words, after 17 landed with model tiers hard-wired and the Coach view carrying the model status. Builds on [17](17-spec-mentions-and-the-scene-read.md) and revises [15](15-spec-the-assistant-runner.md): there are no tiers, there is one chosen model.

## The user story

A cog at the bottom left of the navigation says Settings. Settings holds the story's own settings — everything in `story.json`, the title included — and, in its own pane, Claude Code.

Coaching is a toggle. When it is switched on, and on every app start while it is on, a health check runs. Its status reads **Checking Claude**, **Passed**, or **Error**, and an error says tersely what is wrong: *claude code not installed*, *claude not configured*, *claude not logged in*. In a browser the same check goes through the helper, so the first thing it can say is *assistant helper not running*.

A dropdown picks the model, defaulting to haiku; the choice is checked against what the subscription can actually run, because the health check's last step is a ping with that model.

The prompt templates the reads and checks use are fields the writer can edit. Any change in the Claude pane — the toggle, the model, a prompt — opens a Save and a Cancel below the pane; nothing lands until Save.

## Where things live

`story.json` gains `settings.assistant`: `{ "enabled": true, "model": "haiku" }`. It travels with the story; a collaborator inherits the choice and runs their own check. The health check is never stored: it is what the machine says right now.

The prompts are files in the story folder, `coach/read-scene.md` and `coach/check-continuity.md`, written from the built-in defaults the first time the Claude pane is saved, read at request time, and editable in Settings or in any editor. An empty or missing file means the default. The app appends the story's glossary itself; that part is not a thing to tune.

## The health check, step by step

Claude Code found (`claude --version`, through the shell or the helper) → signed in (`claude auth status --json`: `loggedIn`, the account, the plan) → one ping through the chosen model. The first failure is the error, in the words above; the ping's failure names the model. Passed carries the version, the account and plan, and the model that answered.

## What moves

The Coach view's Model section and its Test button go to Settings. The Coach view keeps Developments and Continuity, and says where the switch is when coaching is off. Reads and checks — the idle read after a save, the Read button, the whole-story passes — run only while the toggle is on and the check has passed.

## Tests

The Settings view: the cog opens it; the title and the settings JSON save to story.json, invalid JSON cannot be saved; switching coaching on shows Checking then Passed with a stub, and each of the terse errors with the matching stub state; the model dropdown defaults to haiku and saves; a prompt edit saves to its file and Cancel reverts it; a story that opens with coaching on runs the check at once; with coaching off the Read button is disabled. The health check itself is a table test over a stub runner.
