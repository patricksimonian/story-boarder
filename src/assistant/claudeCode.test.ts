import { describe, expect, test } from 'vitest'
import { StubProcessRunner } from '../adapters/stubs'
import { claudeArgs, parseClaudeResult, RunnerFailure, type WorkflowRequest } from './claudeCode'
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
      'json',
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
    expect(runner.calls[0].argv.slice(0, 3)).toEqual(['-p', '--output-format', 'json'])
  })

  test('a runner that cannot spawn at all fails with its reason', async () => {
    const runner: StubProcessRunner = new StubProcessRunner()
    runner.spawnClaude = async () => {
      throw new Error('helper not running on port 7311')
    }
    await expect(run(runner, request, { model: 'haiku' })).rejects.toThrow(new RunnerFailure('helper not running on port 7311'))
  })

  test('an unanswered workflow in a test says so rather than pretending', async () => {
    await expect(run(new StubProcessRunner(), { ...request, workflow: 'nothing' }, { model: 'haiku' })).rejects.toThrow(/no canned answer for nothing/)
  })
})
