/**
 * What the page knows about a `claude -p` run: the shape of a run, and
 * how to read what comes back. The page never builds the argv. It sends
 * a run — the workflow, the model, the rubric, the briefing, the schema
 * — and the side that can spawn a process (the desktop shell in
 * src-tauri/src/assistant.rs, the helper in scripts/assistant.mjs)
 * turns that into a command line whose every flag is fixed there. So
 * nothing the page sends can become a flag, and a page that has been
 * taken over, or anything else that reaches the shell or the helper,
 * can ask the writer's Claude Code one question and no more: no tool,
 * no folder, no permission the app never had.
 *
 * The run asks for one schema-validated JSON answer, streamed as it is
 * made, so the app can say whether Claude Code is connecting, thinking,
 * or writing, and how much it has written. The parsers below read that
 * stream and its last line.
 */

export type JsonSchema = Record<string, unknown>

export interface WorkflowRequest {
  /** 'ping', 'read-scene', ... — names the canned answer in tests and the disclosure line in the app. */
  workflow: string
  /** The rubric, fixed per workflow. */
  system: string
  /** Everything the model sees about the story, built by the app. Goes in on stdin. */
  briefing: string
  /** The shape the answer must take. */
  schema: JsonSchema
}

export interface WorkflowUsage {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}

export interface WorkflowResult<T> {
  output: T
  /** Claude Code's own estimate from the result: tokens, and a USD figure that is an estimate, not a charge, on a subscription. */
  usage?: WorkflowUsage
}

/**
 * A run that produced no answer, with a sentence the app can show. A
 * limit — Claude Code's 429, "You've hit your session limit · resets
 * 5:30pm" — is the one failure worth stopping everything for, since
 * every further call would meet the same wall.
 */
export class RunnerFailure extends Error {
  status: number | undefined
  limit: boolean

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
    this.limit = status === 429 || /\b(session|usage|rate) limit\b/i.test(message)
  }
}

/**
 * A run, as the page sends it: a workflow request and the model from the
 * story's settings, an alias Claude Code resolves (`haiku`) or a full
 * name. These five fields are all the page can say about a run. The
 * shell and the helper each check the model is a name before it goes
 * anywhere near a command line; the rest is text Claude Code reads.
 */
export interface ClaudeRun extends WorkflowRequest {
  model: string
}

interface ClaudeResultJson {
  type?: string
  structured_output?: unknown
  result?: unknown
  is_error?: boolean
  api_error_status?: number | null
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Reads a run's ending. The stream's last line is the result; exit zero
 * with `structured_output` is the answer. Exit zero without one: Claude
 * Code prints failures inside the run (not signed in, rate limited) as
 * the result text, so that is the message. A non-zero exit: stderr is
 * the message.
 */
export function parseClaudeResult<T>(stdout: string, stderr: string, exitCode: number): WorkflowResult<T> {
  if (exitCode !== 0) {
    throw new RunnerFailure(firstLine(stderr) || lastResultText(stdout) || `Claude Code exited with code ${exitCode}.`)
  }
  const data = resultLine(stdout)
  if (data === undefined) {
    throw new RunnerFailure(`Claude Code answered with something other than JSON: ${stdout.trim().slice(0, 200) || '(nothing)'}`)
  }
  if (data.structured_output !== undefined && data.structured_output !== null) {
    const usage: WorkflowUsage = {}
    if (typeof data.usage?.input_tokens === 'number') usage.inputTokens = data.usage.input_tokens
    if (typeof data.usage?.output_tokens === 'number') usage.outputTokens = data.usage.output_tokens
    if (typeof data.total_cost_usd === 'number') usage.costUsd = data.total_cost_usd
    return { output: data.structured_output as T, usage }
  }
  const text = typeof data.result === 'string' ? data.result.trim() : ''
  throw new RunnerFailure(text || 'Claude Code returned no structured output.', typeof data.api_error_status === 'number' ? data.api_error_status : undefined)
}

/** The result event: the last line that is one, or the whole output when it is one JSON object (the older, unstreamed shape). */
function resultLine(stdout: string): ClaudeResultJson | undefined {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = tryJson(lines[i])
    if (parsed && (parsed.type === 'result' || lines.length === 1)) return parsed
  }
  return undefined
}

function lastResultText(stdout: string): string {
  const data = resultLine(stdout)
  return typeof data?.result === 'string' ? data.result.trim() : firstLine(stdout)
}

function tryJson(line: string): ClaudeResultJson | undefined {
  try {
    const value: unknown = JSON.parse(line)
    return value && typeof value === 'object' ? (value as ClaudeResultJson) : undefined
  } catch {
    return undefined
  }
}

function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
}

// ---------------------------------------------------------------------------
// Progress: what Claude Code is doing right now, read off its stream.
// ---------------------------------------------------------------------------

export type Phase = 'starting' | 'connected' | 'thinking' | 'writing' | 'done'

export interface Progress {
  phase: Phase
  /** Characters Claude Code has produced so far — thinking and answer both. */
  chars: number
  outputTokens?: number
}

export const NO_PROGRESS: Progress = { phase: 'starting', chars: 0 }

/** One streamed line folded into the progress so far; a line that is not an event leaves it as it was. */
export function readProgressLine(line: string, progress: Progress): Progress {
  let event: Record<string, unknown>
  try {
    event = JSON.parse(line) as Record<string, unknown>
  } catch {
    return progress
  }
  if (!event || typeof event !== 'object') return progress
  if (event.type === 'system') return progress.phase === 'starting' ? { ...progress, phase: 'connected' } : progress
  if (event.type === 'result') return { ...progress, phase: 'done' }
  if (event.type !== 'stream_event') return progress
  const inner = event.event as
    | { type?: string; content_block?: { type?: string }; delta?: Record<string, unknown>; usage?: { output_tokens?: number } }
    | undefined
  if (!inner) return progress
  if (inner.type === 'content_block_start') {
    const kind = inner.content_block?.type
    return { ...progress, phase: kind === 'thinking' ? 'thinking' : kind ? 'writing' : progress.phase }
  }
  if (inner.type === 'content_block_delta' && inner.delta) {
    const piece = inner.delta.thinking ?? inner.delta.text ?? inner.delta.partial_json ?? ''
    const chars = progress.chars + (typeof piece === 'string' ? piece.length : 0)
    const phase = inner.delta.type === 'thinking_delta' ? 'thinking' : 'writing'
    return { ...progress, chars, phase }
  }
  if (inner.type === 'message_delta' && typeof inner.usage?.output_tokens === 'number') {
    return { ...progress, outputTokens: inner.usage.output_tokens }
  }
  return progress
}

/** The phase, in words for a button: "connecting", "thinking", "writing". */
export function phaseWord(progress: Progress): string {
  switch (progress.phase) {
    case 'starting':
      return 'starting'
    case 'connected':
      return 'waiting for the model'
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'writing'
    case 'done':
      return 'finishing'
  }
}
