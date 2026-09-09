import { describe, expect, test } from 'vitest'
import { StubProcessRunner } from '../adapters/stubs'
import { checkHealth } from './health'

describe('the health check', () => {
  test('passes when Claude Code is found, signed in, and the chosen model answers', async () => {
    const runner = new StubProcessRunner()
    runner.authValue = { kind: 'signed-in', account: 'p@example.com', plan: 'max' }
    runner.answerWith('ping', { echo: 'Embers' })
    expect(await checkHealth(runner, 'haiku', 'Embers')).toEqual({
      kind: 'passed',
      detail: 'Claude Code 2.1.215 · signed in as p@example.com, max plan · haiku answers',
    })
    expect(runner.calls[0].model).toBe('haiku')
  })

  test('says tersely what is wrong, first thing first', async () => {
    expect(await checkHealth(undefined, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'no way to reach claude code from this build' })

    const missing = new StubProcessRunner({ kind: 'unavailable', reason: 'Claude Code not found on PATH' })
    expect(await checkHealth(missing, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'claude code not installed' })

    const noHelper = new StubProcessRunner({ kind: 'unavailable', reason: 'The assistant helper is not running — run pnpm assistant' })
    expect(await checkHealth(noHelper, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'assistant helper not running — run pnpm assistant' })

    const old = new StubProcessRunner({ kind: 'unavailable', reason: 'The assistant helper is from an older build — stop it and run pnpm assistant again.' })
    expect(await checkHealth(old, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'assistant helper out of date — stop it and run pnpm assistant again' })

    const signedOut = new StubProcessRunner()
    signedOut.authValue = { kind: 'signed-out' }
    expect(await checkHealth(signedOut, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'claude not logged in' })

    const unknown = new StubProcessRunner()
    unknown.authValue = { kind: 'unknown', reason: 'auth status printed nothing' }
    expect(await checkHealth(unknown, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'claude not configured' })

    const noModel = new StubProcessRunner()
    noModel.answer('ping', { stdout: JSON.stringify({ type: 'result', is_error: true, result: 'The model opus is not available on your plan' }), stderr: '', exitCode: 0 })
    expect(await checkHealth(noModel, 'opus', 'E')).toEqual({ kind: 'error', reason: 'model opus not available: The model opus is not available on your plan' })

    const broken = new StubProcessRunner()
    broken.answer('ping', { stdout: '', stderr: 'boom', exitCode: 1 })
    expect(await checkHealth(broken, 'haiku', 'E')).toEqual({ kind: 'error', reason: 'claude answered with an error: boom' })
  })
})
