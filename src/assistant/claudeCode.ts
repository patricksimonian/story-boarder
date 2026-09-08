/**
 * Everything that knows what `claude -p` looks like, in one place. Both
 * platforms spawn the writer's own Claude Code with the argv built here
 * and hand its output back to the parser here; nothing else in the app
 * knows a flag or a model name.
 *
 * The command asks for one validated JSON answer (`--output-format json`
 * with `--json-schema`), keeps nothing on disk, and loads none of the
 * writer's own settings. It is not `--bare`, because bare mode never
 * reads the subscription login. The only tool left is StructuredOutput,
 * which is how Claude Code delivers the schema-shaped answer: removing
 * every tool (`--disallowedTools "*"`) removes that one too, and the
 * first real run spent five turns being refused it.
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
  /** Claude Code's own estimate from the json result. */
  usage?: WorkflowUsage
}

/** A run that produced no answer, with a sentence the Coach view can show. */
export class RunnerFailure extends Error {}

/** The model comes from the story's settings; an alias Claude Code resolves, or a full name. */
export function claudeArgs(request: WorkflowRequest, model: string): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(request.schema),
    '--model',
    model,
    '--system-prompt',
    request.system,
    '--tools',
    'StructuredOutput',
    '--no-session-persistence',
    '--setting-sources',
    '',
  ]
}

interface ClaudeJson {
  structured_output?: unknown
  result?: unknown
  is_error?: boolean
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Reads a run's ending. Exit zero with `structured_output` is the answer.
 * Exit zero without one: Claude Code prints failures inside the run
 * (not signed in, rate limited) as the result text, so that is the
 * message. A non-zero exit: stderr is the message.
 */
export function parseClaudeResult<T>(stdout: string, stderr: string, exitCode: number): WorkflowResult<T> {
  if (exitCode !== 0) {
    throw new RunnerFailure(firstLine(stderr) || firstLine(stdout) || `Claude Code exited with code ${exitCode}.`)
  }
  let data: ClaudeJson
  try {
    data = JSON.parse(stdout.trim()) as ClaudeJson
  } catch {
    throw new RunnerFailure(`Claude Code answered with something other than JSON: ${stdout.trim().slice(0, 200) || '(nothing)'}`)
  }
  if (data && typeof data === 'object' && data.structured_output !== undefined && data.structured_output !== null) {
    const usage: WorkflowUsage = {}
    if (typeof data.usage?.input_tokens === 'number') usage.inputTokens = data.usage.input_tokens
    if (typeof data.usage?.output_tokens === 'number') usage.outputTokens = data.usage.output_tokens
    if (typeof data.total_cost_usd === 'number') usage.costUsd = data.total_cost_usd
    return { output: data.structured_output as T, usage }
  }
  const text = typeof data?.result === 'string' ? data.result.trim() : ''
  throw new RunnerFailure(text || 'Claude Code returned no structured output.')
}

function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
}
