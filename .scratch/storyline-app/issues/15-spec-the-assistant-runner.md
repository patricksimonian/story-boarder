# 15 — Spec: the assistant runner

Type: spec
Status: specified 2026-09-05 (Patrick's ask; first piece of the dynamic-coaching epic in the README). Revised the same day on his correction: Claude Code is the only backend, there is no API-key path anywhere. Builds the plumbing only; the first real workflow is [16](16-spec-tag-workflows.md), and the model coach in [11](11-spec-the-model-coach.md) rides the same rails later.

## The ask

Patrick wants one piece of scaffolding that lets the app hand a bounded task to Claude and get a typed answer back, consumed directly from the Claude Code he already has installed and signed into, and he wants it to work in the browser build as well as the Tauri app. No API keys, no second bill, no key field in the app. Everything model-shaped in the README's to-do list (tag suggestion, prose cross-referencing, continuity checks, the coach) is a workflow on top of this.

## What Claude Code gives us

`claude -p` is the whole interface. With `--output-format json` and `--json-schema` it returns validated JSON in a `structured_output` field; with `--disallowedTools "*"` every tool leaves the model's context, so one request is one model call; `--model haiku` or `--model opus` picks the tier; the prompt comes in on stdin (capped at 10 MB). It reads the subscription login as long as `--bare` is not passed, because bare mode never reads OAuth credentials. Patrick's machine has 2.1.215 at `%AppData%\npm\claude.cmd`.

One thing to know and decide, not to design around: Anthropic's Agent SDK overview says third-party developers may not offer claude.ai login in their products unless previously approved. Running the writer's own installed `claude -p` from a tool on the writer's own machine is what this spec does. Patrick has heard this and chosen Claude Code only; if the desktop build is ever distributed with this on, that is his conversation to have with Anthropic. It does not go in the README or the app.

## The one command, built once

Everything that knows what `claude -p` looks like lives in `src/assistant/claudeCode.ts`, in TypeScript, and both platforms call it:

```ts
/** The argv for one workflow request. Stdin carries the briefing. */
export function claudeArgs(request: WorkflowRequest): string[]
/** Reads Claude Code's JSON result; throws a readable failure when there is no structured_output. */
export function parseClaudeResult<T>(stdout: string, stderr: string, exitCode: number): WorkflowResult<T>
```

`claudeArgs` returns, in this order:

```
-p --output-format json --json-schema <schema>
--model <alias> --system-prompt <rubric>
--disallowedTools "*" --max-turns 1
--no-session-persistence --setting-sources ""
```

The process is spawned with the app's data directory as its working directory, never the story folder, so there is nothing for the model to read even if a tool slipped through. Layer two from 11 (read-only tools over the folder for the coach's wider reviews) is a later change to this one function: add `--add-dir <story folder>` and `--tools Read,Grep`, nothing else moves.

`parseClaudeResult` handles the three ways a run ends. Exit zero with `structured_output`: the result. Exit zero with a `result` but no `structured_output`: Claude Code prints failures inside the run (missing login, rate limit) as the result on stdout, so that text is the failure message. Non-zero exit: stderr is the message. Every failure is a `RunnerFailure` with a sentence the Coach view can show, never a stack.

Model tiers map to aliases in the same file: `small` is `haiku`, `large` is `opus`. A workflow says which tier it wants; nothing else in the app knows a model name.

## The seam

One interface, in `src/adapters/types.ts` beside `FileAccess` and `GitClient`, because that is what it is: another way the app reaches something outside itself. What differs per platform is only *how a process gets spawned*, so that is all the seam carries:

```ts
export interface ProcessRunner {
  /** Spawns `claude` with argv, writes stdin, resolves when it exits. */
  spawnClaude(argv: string[], stdin: string, opts?: { signal?: AbortSignal }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  /** `claude --version`, or why it can't be run, for the Coach view. */
  status(): Promise<RunnerStatus>
}

export type RunnerStatus =
  | { kind: 'ready'; detail: string }        // 'Claude Code 2.1.215'
  | { kind: 'unavailable'; reason: string }  // 'Claude Code not found on PATH', 'helper not running on port 7311'
```

Above it, `src/assistant/runner.ts` composes: `run(request) = parseClaudeResult(await spawnClaude(claudeArgs(request), request.briefing))`. The request and result shapes:

```ts
export interface WorkflowRequest {
  workflow: string          // 'ping', 'suggest-tags', ...
  system: string            // the rubric, fixed per workflow
  briefing: string          // everything the model sees about the story, built by the app
  schema: JsonSchema        // the shape the answer must take
  model: 'small' | 'large'  // a tier, never an alias
}

export interface WorkflowResult<T> {
  output: T
  /** Claude Code's own estimate from the json result: total_cost_usd and the per-model usage. */
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
}
```

A **workflow** is a pure module in `src/assistant/workflows/`: a name, a `brief(story, target)` function that returns the briefing string, a schema, a rubric, and a tier. Because the briefing is a pure function of the loaded story, every workflow is tested without a model by asserting what the briefing contains and how big it is. This is the layer-one discipline from 11, kept: the app computes the bounded slice; the model never reads the folder.

## The three process runners

**Desktop.** A Tauri command `spawn_claude(argv, stdin)` in `lib.rs`. On Windows the binary is `claude.cmd`, so the command resolves it the way `where` does (walk `PATH` and `PATHEXT`) rather than trusting `Command::new("claude")`; the resolved path is cached and also backs `status()`, which runs `claude --version` once at startup. Cancel kills the process (Claude Code exits 143 and records nothing). Stdout and stderr are collected whole; the results here are a few kilobytes.

**Browser.** A page can't spawn anything, so the browser build talks to a helper on localhost. The helper is `scripts/assistant.mjs` in this repo, started with `pnpm assistant`: a Node HTTP server on `127.0.0.1:7311` with one route, `POST /spawn`, whose body is `{ argv, stdin }` and whose response is `{ stdout, stderr, exitCode }`, plus `GET /status`. It spawns `claude` the same way the Rust command does and does nothing else: no folder access, no state, no routes for anything but spawning. It binds loopback only, refuses any `Origin` that is not the dev or hosted page's, and refuses an argv whose first element is not `-p` or `--version`, so a page cannot turn it into a shell. Node is already on any machine with an npm-installed Claude Code. The browser runner's `status()` is the `GET`, and its `unavailable` reason tells the writer the one command to run.

This is ticket 11's companion, shrunk to a process spawner. It is worth its sixty lines because it is the only way a browser tab reaches the subscription, and it costs the desktop nothing.

**Tests.** `StubProcessRunner` returns canned `{ stdout, stderr, exitCode }` per workflow name and records every argv and stdin, so App-level tests assert the briefing that reached Claude Code and the mutation that followed an accept.

`main.tsx` picks the desktop runner under `isTauri()` and the browser runner otherwise, the same way it picks the platform today.

## Suggestions, generically

Every workflow returns suggestions, and none of them writes. `src/assistant/pending.ts` holds a list of `Suggestion<T>` per open story, in memory, with `accept` and `dismiss`; accepting runs the ordinary mutation the workflow names, so the journal, the atomic save, and the boundary commit see a human edit. This is the pending-state rule from 11, moved down to the plumbing so every workflow inherits it.

## The Coach view

Gains a **Model** section: the status line (`Claude Code 2.1.215`, or the reason it can't run and, in the browser, the `pnpm assistant` command to fix it), a **Test** button that runs the `ping` workflow (briefing: the story's title; schema: `{ echo: string }`), and one line saying a run sends the briefing to Claude through the writer's own Claude Code. The README gets a section headed by what it is for, **To activate coaching**, and nothing but the steps: install Claude Code and sign in; on the desktop, that is all; in a browser, run `pnpm assistant` and leave it running. No terms, no disclosure prose, no explanation of the plumbing.

## Tests

`claudeArgs` is a table test (every flag above, in order, and the tier-to-alias mapping); `parseClaudeResult` covers the three endings. Rust: the Windows resolution of `claude.cmd` and the argv passthrough. The helper: a test that starts it on a random port and asserts the origin check, the argv check, and a round trip against a fake `claude` on `PATH`. The `ping` briefing; the pending list's accept and dismiss; the Coach view's Model section under `StubProcessRunner` for ready, unavailable, and a failed test run.

## Deliberately left to the build

Whether `run` streams progress (`--output-format stream-json` supports it; the first workflows are short enough that a spinner will do). The helper's port and whether it is configurable. Whether the desktop should spawn the helper itself so a browser tab and the desktop app can share one, which is not needed until someone wants both open. What the status line says when Claude Code is installed but not signed in, which only shows up as the failure text of the first run.

## The page sends a run, never an argv

Patrick, 2026-09-09: the runner as specified above let the page build the whole command line and hand it to the shell, and to the helper, to execute. That was remote execution waiting for a caller. The helper's only check was "contains `-p` and not `--bare`", and Claude Code 2.1.215 takes `--dangerously-skip-permissions`, `--tools Bash`, `--mcp-config`, `--plugin-url`, `--add-dir` and `--settings` on a print run, so anything that could post to port 7311 (a local process; the Origin check stops browsers, not curl) or invoke `spawn_claude` from a taken-over page could run commands as the writer through the writer's own signed-in Claude Code. The helper also fell back to `shell: true` for a bare `claude.cmd`, which put the rubric, a file the writer edits, through cmd.exe's re-parsing.

The rule now: the page may say what it wants read and which model reads it, and nothing else. A run is five fields, `workflow`, `model`, `system`, `briefing`, `schema`, and the side that spawns builds the argv itself with every flag fixed: `src-tauri/src/assistant.rs` for the desktop, `scripts/assistant.mjs` for the browser, the same list in both and a test pinning each. `claudeArgs` left `src/assistant/claudeCode.ts`. The model must be a name (letters, digits, dots, dashes, underscores, a `[1m]` suffix, never a leading dash); a run carrying any other field is refused before it is looked at (`deny_unknown_fields` in Rust, a key check in the helper); the helper refuses a Host that is not loopback, and no longer runs anything through cmd.exe. `--strict-mcp-config` joined the fixed flags so no MCP server is loaded from anywhere. A real ping through the new path reports tools `["StructuredOutput"]` and no MCP servers in Claude Code's init line. Helper protocol is 3.

What this does not close: a local process on the writer's machine can still post a run to the helper and spend the writer's quota on a question of its own, since the helper has no secret between it and the page. That is the browser build, which is for development; the desktop build has no port. The webview's CSP is still `null`, which is the next thing to tighten if the desktop build is ever handed to anyone.
