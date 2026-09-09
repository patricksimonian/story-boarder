import { describe, expect, test } from 'vitest'
import { StubProcessRunner } from '../adapters/stubs'
import { claudeArgs, parseClaudeResult, phaseWord, RunnerFailure, type Progress, type WorkflowRequest } from './claudeCode'
import { pingRequest, run } from './runner'

const request: WorkflowRequest = {
  workflow: 'ping',
  system: 'Echo the title.',
  briefing: 'Story title: Embers',
  schema: { type: 'object', properties: { echo: { type: 'string' } }, required: ['echo'] },
}

describe('claudeArgs', () => {
  test('one validated JSON answer, only the output tool left, nothing kept, no settings loaded, not bare', () => {
    expect(claudeArgs(request, 'haiku')).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--json-schema',
      '{"type":"object","properties":{"echo":{"type":"string"}},"required":["echo"]}',
      '--model',
      'haiku',
      '--system-prompt',
      'Echo the title.',
      '--tools',
      'StructuredOutput',
      '--no-session-persistence',
      '--setting-sources',
      '',
    ])
    expect(claudeArgs(request, 'opus')).toContain('opus')
    expect(claudeArgs(request, 'haiku')).not.toContain('--bare')
  })
})

describe('parseClaudeResult', () => {
  test('exit zero with structured_output is the answer, with usage', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '{"echo":"Embers"}',
      structured_output: { echo: 'Embers' },
      total_cost_usd: 0.0012,
      usage: { input_tokens: 40, output_tokens: 8 },
    })
    expect(parseClaudeResult(stdout, '', 0)).toEqual({ output: { echo: 'Embers' }, usage: { inputTokens: 40, outputTokens: 8, costUsd: 0.0012 } })
  })

  test('exit zero without structured_output: the result text is the failure', () => {
    const stdout = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' })
    expect(() => parseClaudeResult(stdout, '', 0)).toThrow(new RunnerFailure('Not logged in · Please run /login'))
  })

  test('a session limit is the failure everything stops for', () => {
    const stdout = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: "You've hit your session limit · resets 5:30pm (America/Vancouver)" })
    let caught: unknown
    try {
      parseClaudeResult(stdout, '', 0)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(RunnerFailure)
    expect((caught as RunnerFailure).message).toBe("You've hit your session limit · resets 5:30pm (America/Vancouver)")
    expect((caught as RunnerFailure).status).toBe(429)
    expect((caught as RunnerFailure).limit).toBe(true)
    expect(new RunnerFailure('Not logged in').limit).toBe(false)
    expect(new RunnerFailure('Rate limit reached, try later').limit).toBe(true)
  })

  test('a non-zero exit: stderr is the failure, stdout when stderr is empty', () => {
    expect(() => parseClaudeResult('', '\nerror: unknown option --nope\n', 2)).toThrow('error: unknown option --nope')
    expect(() => parseClaudeResult('boom', '', 1)).toThrow('boom')
    expect(() => parseClaudeResult('', '', 143)).toThrow('Claude Code exited with code 143.')
  })

  test('something other than JSON on stdout is said as such', () => {
    expect(() => parseClaudeResult('Welcome to Claude Code!', '', 0)).toThrow(/other than JSON: Welcome to Claude Code!/)
  })
})

describe('run', () => {
  test('composes argv and stdin for the runner and parses what comes back', async () => {
    const runner = new StubProcessRunner()
    runner.answerWith('ping', { echo: 'Embers' })
    const result = await run<{ echo: string }>(runner, pingRequest('Embers'), { model: 'haiku' })
    expect(result.output).toEqual({ echo: 'Embers' })
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0].workflow).toBe('ping')
    expect(runner.calls[0].stdin).toBe('Story title: Embers')
    expect(runner.calls[0].argv.slice(0, 3)).toEqual(['-p', '--output-format', 'stream-json'])
  })

  test('a runner that cannot spawn at all fails with its reason', async () => {
    const runner: StubProcessRunner = new StubProcessRunner()
    runner.spawnClaude = async () => {
      throw new Error('helper not running on port 7311')
    }
    await expect(run(runner, request, { model: 'haiku' })).rejects.toThrow(new RunnerFailure('helper not running on port 7311'))
  })

  test('a run that outlives its timeout is stopped and says so; a cancelled one says only that', async () => {
    const runner = new StubProcessRunner()
    let seen: AbortSignal | undefined
    runner.spawnClaude = (_argv, _stdin, opts) =>
      new Promise((resolve) => {
        seen = opts?.signal
        opts?.signal?.addEventListener('abort', () => resolve({ stdout: '', stderr: '', exitCode: 143 }))
      })
    await expect(run(runner, request, { model: 'haiku', quietMs: 20 })).rejects.toThrow('Claude Code said nothing for too long before it connected and was stopped.')
    expect(seen?.aborted).toBe(true)

    const controller = new AbortController()
    const pending = run(runner, request, { model: 'haiku', signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('Cancelled.')
  })

  test('the stream is folded into progress as it comes, and the answer is the last line', async () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm hmm' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"echo":' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 61 } } }),
      JSON.stringify({ type: 'result', subtype: 'success', structured_output: { echo: 'Embers' }, usage: { output_tokens: 61 } }),
    ]
    const runner = new StubProcessRunner()
    runner.answer('ping', { stdout: `${lines.join('\n')}\n`, stderr: '', exitCode: 0 })
    const seen: Progress[] = []
    const result = await run<{ echo: string }>(runner, pingRequest('Embers'), { model: 'haiku', onProgress: (p) => seen.push(p) })
    expect(result.output).toEqual({ echo: 'Embers' })
    expect(result.usage?.outputTokens).toBe(61)
    expect(seen.map((p) => [p.phase, p.chars, p.outputTokens ?? null])).toEqual([
      ['connected', 0, null],
      ['thinking', 0, null],
      ['thinking', 7, null],
      ['writing', 7, null],
      ['writing', 15, null],
      ['writing', 15, 61],
      ['done', 15, 61],
    ])
    expect(phaseWord({ phase: 'thinking', chars: 0 })).toBe('thinking')
  })

  test('an unanswered workflow in a test says so rather than pretending', async () => {
    await expect(run(new StubProcessRunner(), { ...request, workflow: 'nothing' }, { model: 'haiku' })).rejects.toThrow(/no canned answer for nothing/)
  })
})
