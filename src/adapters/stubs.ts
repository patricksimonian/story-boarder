/**
 * Stub adapters: enough to stand behind the shell and to back tests in
 * later stages, no more.
 */

import type {
  AuthStatus,
  FileAccess,
  FolderChangeHandler,
  FolderWatcher,
  Journal,
  JournalEntry,
  ProcessResult,
  ProcessRunner,
  RunnerStatus,
  SpawnOptions,
} from './types'

/**
 * Reads as text the way the stricter of the two real platforms does: the
 * desktop shell refuses a file that is not UTF-8 (the browser decodes it
 * lossily), so a fake that refused nothing would hide exactly the reads
 * that fail on the desktop.
 */
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

export class InMemoryFileAccess implements FileAccess {
  private files = new Map<string, string | Uint8Array>()

  async readText(path: string): Promise<string> {
    const contents = this.files.get(path)
    if (contents === undefined) throw new Error(`No text file at ${path}`)
    if (typeof contents === 'string') return contents
    // A real disk holds bytes either way; readText decodes what writeBinary stored.
    try {
      return strictUtf8.decode(contents)
    } catch {
      throw new Error(`${path} is not UTF-8 text`)
    }
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.files.set(path, contents)
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const contents = this.files.get(path)
    if (contents === undefined) throw new Error(`No binary file at ${path}`)
    return typeof contents === 'string' ? new TextEncoder().encode(contents) : contents
  }

  async writeBinary(path: string, contents: Uint8Array): Promise<void> {
    this.files.set(path, contents)
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir === '' ? '' : `${dir}/`
    return [...this.files.keys()].filter(
      (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
    )
  }

  async listFolders(dir: string): Promise<string[]> {
    const prefix = dir === '' ? '' : `${dir}/`
    const folders = new Set<string>()
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const slash = path.slice(prefix.length).indexOf('/')
      if (slash !== -1) folders.add(path.slice(0, prefix.length + slash))
    }
    return [...folders]
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path)
  }
}

/** A journal in memory — outlives an App unmount, which is all a test needs to fake a crash. */
export class InMemoryJournal implements Journal {
  private entries = new Map<string, JournalEntry>()

  async record(entry: JournalEntry): Promise<void> {
    this.entries.set(entry.path, entry)
  }

  async clear(path: string): Promise<void> {
    this.entries.delete(path)
  }

  async pending(): Promise<JournalEntry[]> {
    return [...this.entries.values()].sort((a, b) => a.at - b.at)
  }
}

/** Watches nothing; nothing ever changes. */
export class StillFolderWatcher implements FolderWatcher {
  watch(_handler: FolderChangeHandler): () => void {
    return () => {}
  }
}

/** A watcher tests fire by hand to stand in for external edits. */
export class ManualWatcher implements FolderWatcher {
  private handlers = new Set<FolderChangeHandler>()

  watch(handler: FolderChangeHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  fire(paths: string[]): void {
    for (const handler of this.handlers) handler(paths)
  }
}

type Canned = ProcessResult | ((stdin: string) => ProcessResult)

/**
 * A process runner that never spawns: it answers each workflow by name
 * with what a test canned for it, and records every argv and stdin so
 * a test can assert the briefing that reached Claude Code.
 */
export class StubProcessRunner implements ProcessRunner {
  kind: 'desktop' | 'browser' = 'desktop'
  calls: { workflow?: string; argv: string[]; stdin: string }[] = []
  private canned = new Map<string, Canned>()

  statusValue: RunnerStatus
  authValue: AuthStatus = { kind: 'signed-in', account: 'writer@example.com', plan: 'max' }

  constructor(status: RunnerStatus = { kind: 'ready', detail: 'Claude Code 2.1.215' }) {
    this.statusValue = status
  }

  /** The raw process ending for a workflow. */
  answer(workflow: string, result: Canned): void {
    this.canned.set(workflow, result)
  }

  /** A successful run: the structured output Claude Code would have printed. */
  answerWith<T>(workflow: string, output: T | ((stdin: string) => T)): void {
    const wrap = (value: T): ProcessResult => ({
      stdout: JSON.stringify({ type: 'result', subtype: 'success', result: JSON.stringify(value), structured_output: value }),
      stderr: '',
      exitCode: 0,
    })
    this.answer(workflow, typeof output === 'function' ? (stdin: string) => wrap((output as (s: string) => T)(stdin)) : wrap(output))
  }

  async spawnClaude(argv: string[], stdin: string, opts?: SpawnOptions): Promise<ProcessResult> {
    this.calls.push({ workflow: opts?.workflow, argv, stdin })
    const canned = this.canned.get(opts?.workflow ?? '')
    if (!canned && opts?.workflow === 'ping') {
      // The health check pings; a stub answers it unless a test says otherwise.
      const echo = stdin.replace(/^Story title: /, '')
      return { stdout: JSON.stringify({ type: 'result', subtype: 'success', result: JSON.stringify({ echo }), structured_output: { echo } }), stderr: '', exitCode: 0 }
    }
    if (!canned) return { stdout: '', stderr: `no canned answer for ${opts?.workflow ?? 'this workflow'}`, exitCode: 1 }
    return typeof canned === 'function' ? canned(stdin) : canned
  }

  async status(): Promise<RunnerStatus> {
    return this.statusValue
  }

  async auth(): Promise<AuthStatus> {
    return this.authValue
  }
}
