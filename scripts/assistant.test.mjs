// @vitest-environment node
import { request } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'
import { acceptableRun, claudeArgs, createAssistant, MODEL_NAME } from './assistant.mjs'

/**
 * The helper: one route that spawns, one that reports, one that cancels,
 * loopback only, the page's origin only, and a run — never an argv — as
 * the only thing it will spawn for. The spawn is faked so nothing here
 * needs Claude Code installed.
 */

const ping = { workflow: 'ping', model: 'haiku', system: 's', briefing: 'Story title: E', schema: { type: 'object' } }

/** fetch will not send a Host of one's choosing; a raw request will — the status it gets back. */
function postAsHost(base, host) {
  return new Promise((resolve, reject) => {
    const req = request(`${base}/spawn`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', host } }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.end(JSON.stringify({ run: ping }))
  })
}

let server
afterEach(() => server?.close())

async function start(spawn, version = async () => '2.1.215', auth = async () => '{"loggedIn":true,"email":"p@example.com","subscriptionType":"max"}') {
  server = createAssistant({ spawn, version, auth, origins: ['http://localhost:5173'] })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

describe('the assistant helper', () => {
  test('spawns for the run it was sent, streams each line as it comes, then the ending', async () => {
    const seen = []
    const base = await start(async (run, { onLine }) => {
      seen.push(run)
      onLine('{"type":"system"}')
      onLine('{"type":"result","structured_output":{"echo":"E"}}')
      return { stdout: '{"type":"system"}\n{"type":"result","structured_output":{"echo":"E"}}\n', stderr: '', exitCode: 0 }
    })
    const response = await fetch(`${base}/spawn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ run: ping, runId: 'r1' }),
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
    expect(seen).toEqual([ping])
  })

  test('reports the version, or why there is none', async () => {
    const base = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    expect(await (await fetch(`${base}/status`)).json()).toEqual({ version: '2.1.215', protocol: 3 })
    server.close()
    const down = await start(async () => ({ stdout: '', stderr: '', exitCode: 0 }), async () => {
      throw new Error('Claude Code not found on PATH')
    })
    expect(await (await fetch(`${down}/status`)).json()).toEqual({ error: 'Claude Code not found on PATH', protocol: 3 })
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

  test('refuses another origin, another host, and anything that is not a run', async () => {
    let spawned = 0
    const base = await start(async () => {
      spawned++
      return { stdout: '', stderr: '', exitCode: 0 }
    })
    const post = (body, origin) =>
      fetch(`${base}/spawn`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) })
    const app = 'http://localhost:5173'
    expect((await post({ run: ping }, 'http://evil.example')).status).toBe(403)
    // A name that resolves to this machine is still not this machine.
    expect(await postAsHost(base, 'storyline.evil.example')).toBe(403)
    // The old shape, an argv: not a run, whatever it says.
    expect((await post({ argv: ['-p', '--output-format', 'stream-json'], stdin: '' }, app)).status).toBe(400)
    // A run that tries to carry an argv, a tool, or a flag as its model.
    expect((await post({ run: { ...ping, argv: ['-p', '--tools', 'Bash'] } }, app)).status).toBe(400)
    expect((await post({ run: { ...ping, tools: 'Bash' } }, app)).status).toBe(400)
    expect((await post({ run: { ...ping, model: '--dangerously-skip-permissions' } }, app)).status).toBe(400)
    expect((await post({ run: { ...ping, model: 'haiku & calc' } }, app)).status).toBe(400)
    expect((await post({ run: { ...ping, briefing: 5 } }, app)).status).toBe(400)
    expect((await post({ run: { ...ping, schema: [] } }, app)).status).toBe(400)
    expect(spawned).toBe(0)
    expect((await post({ run: ping }, app)).status).toBe(200)
    expect(await postAsHost(base, 'localhost:7311')).toBe(200)
    expect(spawned).toBe(2)
  })

  test('a run is five fields and a model that is a name; the argv is fixed and the run’s text goes in as values', () => {
    expect(acceptableRun(ping)).toBe(true)
    expect(acceptableRun({ ...ping, model: 'claude-sonnet-4-5[1m]' })).toBe(true)
    expect(acceptableRun({ ...ping, model: '' })).toBe(false)
    expect(acceptableRun({ ...ping, model: '-p' })).toBe(false)
    expect(acceptableRun({ ...ping, extra: 1 })).toBe(false)
    expect(acceptableRun(['-p'])).toBe(false)
    expect(acceptableRun(null)).toBe(false)
    expect(MODEL_NAME.test('haiku sonnet')).toBe(false)
    expect(claudeArgs({ ...ping, system: '--dangerously-skip-permissions' })).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--json-schema',
      '{"type":"object"}',
      '--model',
      'haiku',
      '--system-prompt',
      // A value, whatever it looks like: commander takes the next word after --system-prompt as the prompt.
      '--dangerously-skip-permissions',
      '--tools',
      'StructuredOutput',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--setting-sources',
      '',
    ])
  })

  test('cancel aborts the run it names', async () => {
    let aborted = false
    const base = await start(
      (_run, { signal }) =>
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
      body: JSON.stringify({ run: ping, runId: 'slow' }),
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await fetch(`${base}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'slow' }) })
    const lines = (await (await running).text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.at(-1).done.exitCode).toBe(143)
    expect(aborted).toBe(true)
  })
})
