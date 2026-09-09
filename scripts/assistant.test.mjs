// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'
import { acceptableArgv, createAssistant } from './assistant.mjs'

/**
 * The helper: one route that spawns, one that reports, one that cancels,
 * loopback only, the page's origin only. The spawn is faked so nothing
 * here needs Claude Code installed.
 */

let server
afterEach(() => server?.close())

async function start(spawn, version = async () => '2.1.215', auth = async () => '{"loggedIn":true,"email":"p@example.com","subscriptionType":"max"}') {
  server = createAssistant({ spawn, version, auth, origins: ['http://localhost:5173'] })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

describe('the assistant helper', () => {
  test('spawns with the argv and stdin it was sent, streams each line as it comes, then the ending', async () => {
    const seen = []
    const base = await start(async (argv, stdin, { onLine }) => {
      seen.push({ argv, stdin })
      onLine('{"type":"system"}')
      onLine('{"type":"result","structured_output":{"echo":"E"}}')
      return { stdout: '{"type":"system"}\n{"type":"result","structured_output":{"echo":"E"}}\n', stderr: '', exitCode: 0 }
    })
    const response = await fetch(`${base}/spawn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ argv: ['-p', '--output-format', 'stream-json'], stdin: 'Story title: E', runId: 'r1' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(response.headers.get('content-type')).toBe('application/x-ndjson')
    const lines = (await response.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines).toEqual([
      { line: '{"type":"system"}' },
      { line: '{"type":"result","structured_output":{"echo":"E"}}' },
      { done: { stdout: '{"type":"system"}\n{"type":"result","structured_output":{"echo":"E"}}\n', stderr: '', exitCode: 0 } },
    ])
    expect(seen).toEqual([{ argv: ['-p', '--output-format', 'stream-json'], stdin: 'Story title: E' }])
  })

  test('reports the version, or why there is none', async () => {
    const base = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    expect(await (await fetch(`${base}/status`)).json()).toEqual({ version: '2.1.215' })
    server.close()
    const down = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }), async () => {
      throw new Error('Claude Code not found on PATH')
    })
    expect(await (await fetch(`${down}/status`)).json()).toEqual({ error: 'Claude Code not found on PATH' })
  })

  test('reports the auth status as printed, or why it could not ask', async () => {
    const base = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    expect(await (await fetch(`${base}/auth`)).json()).toEqual({ json: '{"loggedIn":true,"email":"p@example.com","subscriptionType":"max"}' })
    server.close()
    const down = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }), async () => '2.1.215', async () => {
      throw new Error('claude auth status printed nothing')
    })
    expect(await (await fetch(`${down}/auth`)).json()).toEqual({ error: 'claude auth status printed nothing' })
  })

  test('refuses another origin, a non-print argv, and a bare run', async () => {
    let spawned = 0
    const base = await start(async () => {
      spawned++
      return { stdout: '', stderr: '', exitCode: 0 }
    })
    const post = (body, origin) =>
      fetch(`${base}/spawn`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) })
    expect((await post({ argv: ['-p'], stdin: '' }, 'http://evil.example')).status).toBe(403)
    expect((await post({ argv: ['--version'], stdin: '' }, 'http://localhost:5173')).status).toBe(400)
    expect((await post({ argv: ['-p', '--bare'], stdin: '' }, 'http://localhost:5173')).status).toBe(400)
    expect((await post({ argv: ['-p'], stdin: 5 }, 'http://localhost:5173')).status).toBe(400)
    expect(spawned).toBe(0)
    expect(acceptableArgv(['-p', '--output-format', 'json'])).toBe(true)
  })

  test('cancel aborts the run it names', async () => {
    let aborted = false
    const base = await start(
      (_argv, _stdin, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true
            resolve({ stdout: '', stderr: '', exitCode: 143 })
          })
        }),
    )
    const running = fetch(`${base}/spawn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ argv: ['-p'], stdin: '', runId: 'slow' }),
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await fetch(`${base}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'slow' }) })
    const lines = (await (await running).text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.at(-1).done.exitCode).toBe(143)
    expect(aborted).toBe(true)
  })
})
