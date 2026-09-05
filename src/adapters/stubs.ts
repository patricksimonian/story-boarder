/**
 * Stub adapters: enough to stand behind the shell and to back tests in
 * later stages, no more.
 */

import type {
  FileAccess,
  FolderChangeHandler,
  FolderWatcher,
  Journal,
  JournalEntry,
} from './types'

export class InMemoryFileAccess implements FileAccess {
  private files = new Map<string, string | Uint8Array>()

  async readText(path: string): Promise<string> {
    const contents = this.files.get(path)
    if (contents === undefined) throw new Error(`No text file at ${path}`)
    // A real disk holds bytes either way; readText decodes what writeBinary stored.
    return typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
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
