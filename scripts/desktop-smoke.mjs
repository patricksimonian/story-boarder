/**
 * Drives the built desktop app through the things the unit tests can't
 * reach: a real WebView2, the real IPC, a real folder on disk. It opens
 * a copy of a story folder, exports the playable HTML, commits a
 * checkpoint, and reports every console error and unhandled rejection
 * the page raised on the way. Nothing it does touches the folder you
 * name — it works on a copy under the temp directory.
 *
 *   pnpm desktop:smoke <story folder>            # the release build
 *   pnpm desktop:smoke <story folder> --debug    # the debug build, with `pnpm dev` running
 *
 * The app is launched with WebView2's remote-debugging port open, and
 * driven over the Chrome DevTools Protocol with nothing but Node's own
 * fetch and WebSocket. The recents file is seeded with the copy so the
 * start screen can open it without the native folder picker, and put
 * back as it was afterwards.
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const debug = args.includes('--debug')
const storyArg = args.find((a) => !a.startsWith('--'))
if (!storyArg) {
  console.error('Usage: pnpm desktop:smoke <story folder> [--debug]')
  process.exit(2)
}

const repo = resolve(import.meta.dirname, '..')
const exe = join(repo, 'src-tauri', 'target', debug ? 'debug' : 'release', 'story-boarder.exe')
if (!existsSync(exe)) {
  console.error(`No build at ${exe} — run ${debug ? 'cargo build --manifest-path src-tauri/Cargo.toml' : 'pnpm desktop:build'} first.`)
  process.exit(2)
}
const { identifier } = JSON.parse(readFileSync(join(repo, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const recentsFile = join(process.env.APPDATA, identifier, 'recents.json')
const port = 9229

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(what, check, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await wait(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

/** One CDP session on the app's page; console output and exceptions collect in `logs`. */
async function connect() {
  const targets = await until('the remote-debugging port', () =>
    fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null),
  )
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, reject) => {
    ws.onopen = r
    ws.onerror = reject
  })
  let id = 0
  const pending = new Map()
  const logs = []
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      logs.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      logs.push(`exception: ${d.exception?.description ?? d.text}`)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id
      pending.set(n, resolve)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  return { evaluate, logs, close: () => ws.close() }
}

// In-page helpers, evaluated as source text.
const helpers = `
  const btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
  const statuses = () => [...document.querySelectorAll('[role=status]')].map((e) => e.textContent)
  const alerts = () => [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent)
`
const inPage = (body) => `(async () => { ${helpers}; ${body} })()`

async function main() {
  const source = resolve(storyArg)
  const work = mkdtempSync(join(tmpdir(), 'story-boarder-smoke-'))
  const name = `smoke-${basename(source)}`
  const copy = join(work, name)
  cpSync(source, copy, { recursive: true, filter: (p) => basename(p) !== '.git' && basename(p) !== 'exports' })
  console.log(`Story copy: ${copy}`)

  const hadRecents = existsSync(recentsFile)
  const recentsBefore = hadRecents ? readFileSync(recentsFile, 'utf8') : null
  const rows = recentsBefore ? JSON.parse(recentsBefore) : []
  writeFileSync(recentsFile, JSON.stringify([{ name, path: copy, opened_at: Date.now() }, ...rows], null, 2))

  const app = spawn(exe, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: 'ignore',
  })
  const failures = []
  let session = null
  try {
    session = await connect()
    const { evaluate, logs } = session
    await until('the start screen', () => evaluate(inPage(`return !!btn(${JSON.stringify(name)})`)))
    await evaluate(inPage(`btn(${JSON.stringify(name)}).click()`))
    await until('the story to open', () => evaluate(inPage(`return !!btn('⬇ Playable HTML')`)))
    console.log('Opened the story.')

    // The opening boundary commit — or the sidebar saying why not.
    const opened = await until('the opening commit', () =>
      existsSync(join(copy, '.git', 'refs', 'heads', 'main')) ||
      evaluate(inPage(`const a = alerts(); return a.length ? a.join(' | ') : null`)),
    )
    if (opened !== true) throw new Error(`opening commit: ${opened}`)
    const firstHead = readFileSync(join(copy, '.git', 'refs', 'heads', 'main'), 'utf8').trim()
    console.log(`Opening commit: ${firstHead.slice(0, 7)}`)

    // The playable export.
    await evaluate(inPage(`btn('⬇ Playable HTML').click()`))
    const note = await until('the export to finish', () =>
      evaluate(inPage(`const s = statuses(); return s.find((t) => !t.startsWith('Compiling')) ?? null`)),
    )
    console.log(`Export: ${note}`)
    if (!note.startsWith('Saved the playable file.')) failures.push(`export: ${note}`)
    else if (!existsSync(join(copy, 'exports')) || !statSync(join(copy, 'exports')).isDirectory()) failures.push('export: no exports/ folder on disk')

    // A checkpoint through the dialog.
    await evaluate(inPage(`
      btn('⚑ Checkpoint…').click()
      await new Promise((r) => setTimeout(r, 300))
      const input = document.querySelector('input[aria-label=Message]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Smoke checkpoint')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      btn('Commit checkpoint').click()
    `))
    await until('the checkpoint to land', () =>
      evaluate(inPage(`return !document.querySelector('[role=dialog]') || alerts().length > 0`)),
    )
    const alerts = await evaluate(inPage(`return alerts()`))
    if (alerts.length) failures.push(`alerts: ${alerts.join(' | ')}`)
    const secondHead = readFileSync(join(copy, '.git', 'refs', 'heads', 'main'), 'utf8').trim()
    console.log(`Checkpoint: ${secondHead.slice(0, 7)}`)
    if (secondHead === firstHead) failures.push('checkpoint: main did not move')

    await wait(500)
    if (logs.length) failures.push(...logs)
  } catch (error) {
    failures.push(error.message)
    if (session?.logs.length) failures.push(...session.logs)
  } finally {
    session?.close()
    app.kill()
    if (hadRecents) writeFileSync(recentsFile, recentsBefore)
    else rmSync(recentsFile, { force: true })
    await wait(500)
    rmSync(work, { recursive: true, force: true })
  }

  if (failures.length) {
    console.error('\nFAILED')
    for (const f of failures) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log('\nPASSED: opened, committed, exported, and checkpointed with nothing on the console.')
}

await main()
