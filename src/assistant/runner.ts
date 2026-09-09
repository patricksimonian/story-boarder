import type { ProcessRunner } from '../adapters/types'
import { claudeArgs, parseClaudeResult, RunnerFailure, type WorkflowRequest, type WorkflowResult } from './claudeCode'

/** How long a run may take before it is stopped and said to have stalled. */
export const RUN_TIMEOUT_MS = 120_000

/**
 * One workflow request, start to finish: the argv from claudeCode, the
 * briefing on stdin, the answer parsed back. The runner is the platform's
 * way of spawning a process and nothing more. A run that outlives the
 * timeout is killed and fails with a sentence, so nothing waits forever
 * on an API that is retrying behind the scenes; a run the writer cancels
 * fails with "Cancelled." and no more.
 */
export async function run<T>(
  runner: ProcessRunner,
  request: WorkflowRequest,
  opts: { model: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<WorkflowResult<T>> {
  const timeoutMs = opts.timeoutMs ?? RUN_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const onOuterAbort = () => controller.abort()
  if (opts.signal?.aborted) controller.abort()
  else opts.signal?.addEventListener('abort', onOuterAbort)
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let result
  try {
    result = await runner.spawnClaude(claudeArgs(request, opts.model), request.briefing, { signal: controller.signal, workflow: request.workflow })
  } catch (error) {
    if (timedOut) throw new RunnerFailure(stalled(timeoutMs))
    if (controller.signal.aborted) throw new RunnerFailure('Cancelled.')
    throw new RunnerFailure((error as Error).message)
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onOuterAbort)
  }
  if (timedOut) throw new RunnerFailure(stalled(timeoutMs))
  if (controller.signal.aborted) throw new RunnerFailure('Cancelled.')
  return parseClaudeResult<T>(result.stdout, result.stderr, result.exitCode)
}

function stalled(timeoutMs: number): string {
  const minutes = Math.round(timeoutMs / 60_000)
  if (minutes < 1) return 'Claude Code took too long and was stopped.'
  return `Claude Code took longer than ${minutes === 1 ? 'a minute' : `${minutes} minutes`} and was stopped.`
}

/** The connectivity check behind the Coach view's Test button: the story's title, echoed. */
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
