import type { ProcessRunner } from '../adapters/types'
import { NO_PROGRESS, parseClaudeResult, readProgressLine, RunnerFailure, type Progress, type WorkflowRequest, type WorkflowResult } from './claudeCode'

/** How long Claude Code may go without a word before it is stopped and said to have gone quiet. */
export const QUIET_TIMEOUT_MS = 180_000

/**
 * One workflow request, start to finish: the request and the model
 * handed to the runner as a run, the streamed lines folded into
 * progress the caller can show, the answer parsed off the last line.
 * The runner is the platform's way of spawning a process and nothing
 * more; the command line is built on the far side of it. A run that goes
 * quiet for too long is killed and fails with a sentence, so nothing
 * waits forever on an API retrying behind the scenes; a run the writer
 * cancels fails with "Cancelled." and no more.
 */
export async function run<T>(
  runner: ProcessRunner,
  request: WorkflowRequest,
  opts: { model: string; signal?: AbortSignal; quietMs?: number; onProgress?: (progress: Progress) => void },
): Promise<WorkflowResult<T>> {
  const quietMs = opts.quietMs ?? QUIET_TIMEOUT_MS
  const controller = new AbortController()
  let wentQuiet = false
  const onOuterAbort = () => controller.abort()
  if (opts.signal?.aborted) controller.abort()
  else opts.signal?.addEventListener('abort', onOuterAbort)

  let timer: ReturnType<typeof setTimeout> | undefined
  const armQuiet = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      wentQuiet = true
      controller.abort()
    }, quietMs)
  }
  armQuiet()

  let progress: Progress = NO_PROGRESS
  const onLine = (line: string) => {
    armQuiet()
    const next = readProgressLine(line, progress)
    if (next !== progress) {
      progress = next
      opts.onProgress?.(progress)
    }
  }

  let result
  try {
    result = await runner.spawnClaude({ ...request, model: opts.model }, { signal: controller.signal, onLine })
  } catch (error) {
    if (wentQuiet) throw new RunnerFailure(quiet(quietMs, progress))
    if (controller.signal.aborted) throw new RunnerFailure('Cancelled.')
    throw new RunnerFailure((error as Error).message)
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onOuterAbort)
  }
  if (wentQuiet) throw new RunnerFailure(quiet(quietMs, progress))
  if (controller.signal.aborted) throw new RunnerFailure('Cancelled.')
  return parseClaudeResult<T>(result.stdout, result.stderr, result.exitCode)
}

function quiet(quietMs: number, progress: Progress): string {
  const minutes = Math.round(quietMs / 60_000)
  const span = minutes < 1 ? 'too long' : minutes === 1 ? 'a minute' : `${minutes} minutes`
  const doing = progress.phase === 'starting' ? 'before it connected' : `while ${progress.phase === 'connected' ? 'waiting for the model' : progress.phase}`
  return `Claude Code said nothing for ${span} ${doing} and was stopped.`
}

/** The connectivity check behind the coaching switch: the story's title, echoed. */
export function pingRequest(title: string): WorkflowRequest {
  return {
    workflow: 'ping',
    system: 'You are a connectivity check for a writing tool. Set the echo field to exactly the story title you are given, and nothing else.',
    briefing: `Story title: ${title}`,
    schema: {
      type: 'object',
      properties: { echo: { type: 'string' } },
      required: ['echo'],
      additionalProperties: false,
    },
  }
}
