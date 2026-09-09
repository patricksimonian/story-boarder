#!/usr/bin/env node
// The assistant helper for the browser build. A page cannot spawn a
// process, so this listens on localhost and does one thing: spawns the
// writer's own `claude` with the argv the page sends and hands back what
// it printed. No folder access, no state, no other routes. It binds
// loopback only, refuses any Origin that is not the app's page, and
// refuses an argv that is not a one-shot print run. Start it with
// `pnpm assistant` and leave it running.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PORT = 7311
export const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']

/** Finds `claude` the way the shell does, then prefers its JS entry so no shell sits between us and its argv. */
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
      return { command: candidate, prefix: [], display: candidate }
    }
  }
  return null
}

/** Spawns claude with argv, writes stdin, hands each stdout line to onLine as it comes, and resolves with what it printed and how it exited. */
export function spawnClaude(argv, stdin, { signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const found = locateClaude()
    if (!found) {
      reject(new Error('Claude Code not found on PATH'))
      return
    }
    const child = spawn(found.command, [...found.prefix, ...argv], {
      cwd: tmpdir(),
      // Claude Code thinks before it answers unless told not to; for a
      // one-shot read that was forty seconds and thousands of tokens
      // spent before the first word, for no better answer.
      env: { ...process.env, MAX_THINKING_TOKENS: '0' },
      windowsHide: true,
      shell: found.prefix.length === 0 && /\.(cmd|bat)$/i.test(found.command),
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
  return spawnClaude(['--version'], '').then((r) => {
    const version = r.stdout.trim().split(/\s+/)[0]
    if (r.exitCode !== 0 || !version) throw new Error(r.stderr.trim() || 'claude --version printed nothing')
    return version
  })
}

/** `claude auth status --json`, as printed. */
export function claudeAuth() {
  return spawnClaude(['auth', 'status', '--json'], '').then((r) => {
    if (r.exitCode !== 0 || !r.stdout.trim()) throw new Error(r.stderr.trim() || 'claude auth status printed nothing')
    return r.stdout.trim()
  })
}

/** A one-shot print run and nothing else: anything interactive or bare is refused. */
export function acceptableArgv(argv) {
  return Array.isArray(argv) && argv.every((a) => typeof a === 'string') && argv.includes('-p') && !argv.includes('--bare')
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
    if (req.method === 'OPTIONS') {
      answer(204, {})
      return
    }
    if (req.method === 'GET' && req.url === '/status') {
      try {
        answer(200, { version: await version() })
      } catch (error) {
        answer(200, { error: error.message })
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
      if (!acceptableArgv(body.argv) || typeof body.stdin !== 'string') {
        answer(400, { error: 'Only a one-shot print run is accepted' })
        return
      }
      const controller = new AbortController()
      if (typeof body.runId === 'string') runs.set(body.runId, controller)
      const started = Date.now()
      const model = body.argv[body.argv.indexOf('--model') + 1] ?? '?'
      // One JSON object per line: the lines Claude Code prints as it prints
      // them, then the ending — so the page can say what is happening.
      res.writeHead(200, {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-store',
        ...(origin && origins.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type' } : {}),
      })
      const send = (obj) => res.write(`${JSON.stringify(obj)}\n`)
      try {
        const result = await spawnFn(body.argv, body.stdin, { signal: controller.signal, onLine: (line) => send({ line }) })
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
