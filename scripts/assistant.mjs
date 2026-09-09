#!/usr/bin/env node
// The assistant helper for the browser build. A page cannot spawn a
// process, so this listens on localhost and does one thing: spawns the
// writer's own `claude` for the run the page sends and hands back what
// it printed. The page sends a run — workflow, model, rubric, briefing,
// schema — and never an argv: every flag is fixed in claudeArgs below,
// so nothing that reaches this port can hand Claude Code a tool, a
// folder, or a permission. No folder access, no state, no other routes.
// It binds loopback only, answers only a loopback Host, refuses any
// Origin that is not the app's page, and refuses a body that is not a
// run. Start it with `pnpm assistant` and leave it running.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PORT = 7311
/** Bumped whenever the page and the helper must change together; the page refuses an older helper by name. 3: a run, not an argv. */
export const PROTOCOL = 3
export const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']

/**
 * Finds `claude` the way the shell does, then prefers what the npm
 * script runs so no shell sits between us and its argv. A `.cmd` with
 * nothing runnable beside it is found but refused, with the reason in
 * `refused`: cmd.exe rereads every argument, and a rubric is text a
 * writer edits.
 */
export function locateClaude(env = process.env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase()) : ['']
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = join(dir, `claude${ext}`)
      if (!existsSync(candidate)) continue
      // The npm install puts a claude.cmd beside node_modules, and what
      // it runs sits in there: a native bin/claude.exe in current
      // releases, a cli.js for node in older ones. Running that directly
      // keeps every argument intact, where a shell would reread them.
      const pkg = join(dir, 'node_modules', '@anthropic-ai', 'claude-code')
      const native = join(pkg, 'bin', 'claude.exe')
      if (existsSync(native)) return { command: native, prefix: [], display: native }
      const cli = join(pkg, 'cli.js')
      if (existsSync(cli)) return { command: process.execPath, prefix: [cli], display: candidate }
      if (/\.(cmd|bat)$/i.test(candidate)) {
        return { command: candidate, prefix: [], display: candidate, refused: `${candidate} is a script with nothing runnable beside it; this helper does not run Claude Code through cmd.exe` }
      }
      return { command: candidate, prefix: [], display: candidate }
    }
  }
  return null
}

/** The model: an alias like `haiku`, or a full name — letters, digits, dots, dashes, and a `[1m]` suffix. Never a flag. */
export const MODEL_NAME = /^[a-z0-9][a-z0-9._[\]-]{0,79}$/i

const RUN_FIELDS = ['workflow', 'model', 'system', 'briefing', 'schema']

/**
 * A run is five fields and nothing else: the four of a workflow request
 * (workflow, system, briefing, schema) and a model name. A body with
 * another field in it, or a model that is not a name, is not a run.
 */
export function acceptableRun(run) {
  return (
    !!run &&
    typeof run === 'object' &&
    !Array.isArray(run) &&
    Object.keys(run).every((key) => RUN_FIELDS.includes(key)) &&
    typeof run.workflow === 'string' &&
    typeof run.system === 'string' &&
    typeof run.briefing === 'string' &&
    !!run.schema &&
    typeof run.schema === 'object' &&
    !Array.isArray(run.schema) &&
    typeof run.model === 'string' &&
    MODEL_NAME.test(run.model)
  )
}

/**
 * The argv for one run. Every flag is fixed here and the run's own text
 * goes in as values, so nothing in a run can add a flag. The run asks
 * for one schema-validated JSON answer, streamed as it is made. It keeps
 * nothing on disk, loads none of the writer's settings, and takes no
 * MCP server from anywhere. It is not `--bare`, because bare mode never
 * reads the subscription login. The only tool left is StructuredOutput,
 * which is how Claude Code delivers the schema-shaped answer: removing
 * every tool removes that one too, and the first real run spent five
 * turns being refused it. src-tauri/src/assistant.rs builds the same
 * list for the desktop build; change both, and the tests that pin them.
 */
export function claudeArgs(run) {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--json-schema',
    JSON.stringify(run.schema),
    '--model',
    run.model,
    '--system-prompt',
    run.system,
    '--tools',
    'StructuredOutput',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--setting-sources',
    '',
  ]
}

/** Spawns claude for one run, the briefing on stdin, hands each stdout line to onLine as it comes, and resolves with what it printed and how it exited. */
export function spawnClaude(run, opts = {}) {
  if (!acceptableRun(run)) return Promise.reject(new Error('Not a run: a run is workflow, model, system, briefing, and schema, with a model that is a name'))
  return spawnArgv(claudeArgs(run), run.briefing, opts)
}

/** The process itself: claude with this argv, this stdin. Only claudeArgs, the version, and the auth check reach it. */
function spawnArgv(argv, stdin, { signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const found = locateClaude()
    if (!found) {
      reject(new Error('Claude Code not found on PATH'))
      return
    }
    if (found.refused) {
      reject(new Error(found.refused))
      return
    }
    const child = spawn(found.command, [...found.prefix, ...argv], {
      cwd: tmpdir(),
      // Claude Code thinks before it answers unless told not to; for a
      // one-shot read that was forty seconds and thousands of tokens
      // spent before the first word, for no better answer.
      env: { ...process.env, MAX_THINKING_TOKENS: '0' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let pending = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk
      if (!onLine) return
      pending += chunk
      const parts = pending.split(/\r?\n/)
      pending = parts.pop() ?? ''
      for (const line of parts) if (line.trim()) onLine(line)
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (onLine && pending.trim()) onLine(pending)
      resolve({ stdout, stderr, exitCode: code ?? -1 })
    })
    signal?.addEventListener('abort', () => child.kill())
    child.stdin.end(stdin)
  })
}

export function claudeVersion() {
  return spawnArgv(['--version'], '').then((r) => {
    const version = r.stdout.trim().split(/\s+/)[0]
    if (r.exitCode !== 0 || !version) throw new Error(r.stderr.trim() || 'claude --version printed nothing')
    return version
  })
}

/** `claude auth status --json`, as printed. */
export function claudeAuth() {
  return spawnArgv(['auth', 'status', '--json'], '').then((r) => {
    if (r.exitCode !== 0 || !r.stdout.trim()) throw new Error(r.stderr.trim() || 'claude auth status printed nothing')
    return r.stdout.trim()
  })
}

/** The server, not yet listening: tests hand in a fake spawn and a port of their own. */
export function createAssistant({ spawn: spawnFn = spawnClaude, version = claudeVersion, auth = claudeAuth, origins = DEFAULT_ORIGINS } = {}) {
  const runs = new Map()
  return createServer(async (req, res) => {
    const origin = req.headers.origin
    const answer = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        ...(origin && origins.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type' } : {}),
      })
      res.end(JSON.stringify(body))
    }
    if (origin && !origins.includes(origin)) {
      answer(403, { error: `Origin ${origin} is not the app` })
      return
    }
    // A page elsewhere that resolves a name to 127.0.0.1 still says that name here.
    if (!LOOPBACK_HOST.test(req.headers.host ?? '')) {
      answer(403, { error: `Host ${req.headers.host ?? '(none)'} is not this machine` })
      return
    }
    if (req.method === 'OPTIONS') {
      answer(204, {})
      return
    }
    if (req.method === 'GET' && req.url === '/status') {
      try {
        answer(200, { version: await version(), protocol: PROTOCOL })
      } catch (error) {
        answer(200, { error: error.message, protocol: PROTOCOL })
      }
      return
    }
    if (req.method === 'GET' && req.url === '/auth') {
      try {
        answer(200, { json: await auth() })
      } catch (error) {
        answer(200, { error: error.message })
      }
      return
    }
    if (req.method === 'POST' && (req.url === '/spawn' || req.url === '/cancel')) {
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        answer(400, { error: 'Body must be JSON' })
        return
      }
      if (req.url === '/cancel') {
        runs.get(body.runId)?.abort()
        answer(200, {})
        return
      }
      if (!acceptableRun(body.run)) {
        answer(400, { error: 'Only a run is accepted: workflow, model, system, briefing, and schema, with a model that is a name' })
        return
      }
      const controller = new AbortController()
      if (typeof body.runId === 'string') runs.set(body.runId, controller)
      const started = Date.now()
      const model = body.run.model
      // One JSON object per line: the lines Claude Code prints as it prints
      // them, then the ending — so the page can say what is happening.
      res.writeHead(200, {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-store',
        ...(origin && origins.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type' } : {}),
      })
      const send = (obj) => res.write(`${JSON.stringify(obj)}\n`)
      try {
        const result = await spawnFn(body.run, { signal: controller.signal, onLine: (line) => send({ line }) })
        log(`run ${model}: ${((Date.now() - started) / 1000).toFixed(1)}s, exit ${result.exitCode}${describe(result.stdout)}`)
        send({ done: result })
      } catch (error) {
        log(`run ${model}: ${((Date.now() - started) / 1000).toFixed(1)}s, failed: ${error.message}`)
        send({ error: error.message })
      } finally {
        if (typeof body.runId === 'string') runs.delete(body.runId)
        res.end()
      }
      return
    }
    answer(404, { error: 'No such route' })
  })
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/** One line per run on the helper's terminal, so a slow read can be seen for what it is. */
function log(line) {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) console.log(`${new Date().toLocaleTimeString()}  ${line}`)
}

function describe(stdout) {
  try {
    const last = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? ''
    const j = JSON.parse(last)
    const parts = []
    if (j.num_turns) parts.push(`${j.num_turns} turns`)
    if (j.usage?.output_tokens) parts.push(`${j.usage.output_tokens} out tokens`)
    if (j.is_error) parts.push(`error: ${String(j.result).slice(0, 80)}`)
    return parts.length ? `, ${parts.join(', ')}` : ''
  } catch {
    return ''
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => (text += chunk))
    req.on('end', () => resolve(text))
    req.on('error', reject)
  })
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const origins = [...DEFAULT_ORIGINS, ...(process.env.ASSISTANT_ORIGINS ?? '').split(',').filter(Boolean)]
  const server = createAssistant({ origins })
  server.listen(PORT, '127.0.0.1', () => {
    const found = locateClaude()
    console.log(`Assistant helper listening on http://127.0.0.1:${PORT}`)
    console.log(found ? `Claude Code at ${found.display}` : 'Claude Code not found on PATH — install it and sign in, then restart this.')
    console.log(`Accepting the page from ${origins.join(', ')}. Ctrl+C stops it.`)
  })
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is taken — is another helper running?` : error.message)
    process.exit(1)
  })
}

export const here = dirname(fileURLToPath(import.meta.url))
