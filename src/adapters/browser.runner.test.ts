// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'
import { createAssistant } from '../../scripts/assistant.mjs'
import { run } from '../assistant/runner'
import { helperRunner } from './browser'

/**
 * The browser runner against the helper it talks to, over the real HTTP
 * stream: lines arrive as Claude Code prints them, the ending last, and
 * the run parses the answer off it. The spawn is faked, so no Claude Code
 * is needed; what is under test is the wire between page and helper.
 */

let server: ReturnType<typeof createAssistant> | undefined
afterEach(() => server?.close())

async function start(spawn: (argv: string[], stdin: string, opts: { onLine?: (line: string) => void; signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string; exitCode: number }>) {
  server = createAssistant({ spawn, version: async () => '2.1.215', auth: async () => '{"loggedIn":true}', origins: ['http://localhost:5173'] })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address() as { port: number }
  return `http://127.0.0.1:${address.port}`
}

describe('the browser runner over the helper', () => {
  test('streams lines as they come and hands back the ending', async () => {
    const lines = [
      '{"type":"system","subtype":"init"}',
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use"}}}',
      '{"type":"result","subtype":"success","structured_output":{"echo":"Embers"}}',
    ]
    const base = await start(async (_argv, _stdin, { onLine }) => {
      for (const line of lines) {
        onLine?.(line)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return { stdout: `${lines.join('\n')}\n`, stderr: '', exitCode: 0 }
    })
    const seen: string[] = []
    const result = await helperRunner(base).spawnClaude(['-p'], 'briefing', { onLine: (line) => seen.push(line) })
    expect(seen).toEqual(lines)
    expect(result).toEqual({ stdout: `${lines.join('\n')}\n`, stderr: '', exitCode: 0 })

    const phases: string[] = []
    const answer = await run<{ echo: string }>(helperRunner(base), { workflow: 'ping', system: 's', briefing: 'b', schema: {} }, { model: 'haiku', onProgress: (p) => phases.push(p.phase) })
    expect(answer.output).toEqual({ echo: 'Embers' })
    expect(phases).toEqual(['connected', 'writing', 'done'])
  })

  test('the status names the helper it needs, and an older helper by what to do', async () => {
    const base = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    expect(await helperRunner(base).status()).toEqual({ kind: 'ready', detail: 'Claude Code 2.1.215' })
    const older = helperRunner(base, async () => new Response(JSON.stringify({ version: '2.1.215' }), { status: 200 }))
    expect(await older.status()).toEqual({ kind: 'unavailable', reason: 'The assistant helper is from an older build — stop it and run pnpm assistant again.' })
  })

  test('a helper that fails says why', async () => {
    const base = await start(async () => {
      throw new Error('Claude Code not found on PATH')
    })
    await expect(helperRunner(base).spawnClaude(['-p'], 'briefing')).rejects.toThrow('Claude Code not found on PATH')
  })
})
