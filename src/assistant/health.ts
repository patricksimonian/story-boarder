import type { ProcessRunner } from '../adapters/types'
import { pingRequest, run } from './runner'

/**
 * The health check behind the coaching switch: Claude Code found, signed
 * in, and answering through the chosen model. The first failure is the
 * error, said tersely; Passed carries what was found.
 */
export type Health =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'passed'; detail: string }
  | { kind: 'error'; reason: string }

export async function checkHealth(runner: ProcessRunner | undefined, model: string, title: string): Promise<Health> {
  if (!runner) return { kind: 'error', reason: 'no way to reach claude code from this build' }

  const status = await runner.status()
  if (status.kind !== 'ready') {
    if (/older build/i.test(status.reason)) return { kind: 'error', reason: 'assistant helper out of date — stop it and run pnpm assistant again' }
    return { kind: 'error', reason: /helper/i.test(status.reason) ? 'assistant helper not running — run pnpm assistant' : 'claude code not installed' }
  }

  const auth = await runner.auth()
  if (auth.kind === 'signed-out') return { kind: 'error', reason: 'claude not logged in' }
  if (auth.kind === 'unknown') return { kind: 'error', reason: 'claude not configured' }

  try {
    await run<{ echo: string }>(runner, pingRequest(title), { model })
  } catch (error) {
    const reason = (error as Error).message
    return { kind: 'error', reason: /model|not available|plan/i.test(reason) ? `model ${model} not available: ${reason}` : `claude answered with an error: ${reason}` }
  }

  const who = [auth.account, auth.plan ? `${auth.plan} plan` : undefined].filter(Boolean).join(', ')
  return { kind: 'passed', detail: `${status.detail}${who ? ` · signed in as ${who}` : ' · signed in'} · ${model} answers` }
}
