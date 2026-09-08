import type { ProcessRunner } from '../adapters/types'
import { claudeArgs, parseClaudeResult, RunnerFailure, type WorkflowRequest, type WorkflowResult } from './claudeCode'

/**
 * One workflow request, start to finish: the argv from claudeCode, the
 * briefing on stdin, the answer parsed back. The runner is the platform's
 * way of spawning a process and nothing more.
 */
export async function run<T>(
  runner: ProcessRunner,
  request: WorkflowRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<WorkflowResult<T>> {
  let result
  try {
    result = await runner.spawnClaude(claudeArgs(request), request.briefing, { signal: opts.signal, workflow: request.workflow })
  } catch (error) {
    if (opts.signal?.aborted) throw new RunnerFailure('Cancelled.')
    throw new RunnerFailure((error as Error).message)
  }
  if (opts.signal?.aborted) throw new RunnerFailure('Cancelled.')
  return parseClaudeResult<T>(result.stdout, result.stderr, result.exitCode)
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
    model: 'small',
  }
}
