import type {
  FileAccess,
  FolderChangeHandler,
  FolderWatcher,
  Journal,
  JournalEntry,
  OpenedFolder,
  Platform,
} from './types'

/**
 * The browser platform: File System Access API for the story folder,
 * FileSystemObserver (polling fallback) for watching, and directory
 * handles persisted in IndexedDB so recents survive a restart.
 */

export class FsaFileAccess implements FileAccess {
  private root: FileSystemDirectoryHandle

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
    let handle = this.root
    for (const part of path.split('/').filter(Boolean)) {
      try {
        handle = await handle.getDirectoryHandle(part, { create })
      } catch {
        return undefined
      }
    }
    return handle
  }

  private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | undefined> {
    const slash = path.lastIndexOf('/')
    const parent = await this.dir(slash === -1 ? '' : path.slice(0, slash), create)
    if (!parent) return undefined
    try {
      return await parent.getFileHandle(path.slice(slash + 1), { create })
    } catch {
      return undefined
    }
  }

  async readText(path: string): Promise<string> {
    const handle = await this.fileHandle(path, false)
    if (!handle) throw new Error(`No file at ${path}`)
    return (await handle.getFile()).text()
  }

  /** createWritable writes to a swap file and swaps in on close — atomic. */
  async writeText(path: string, contents: string): Promise<void> {
    const handle = await this.fileHandle(path, true)
    if (!handle) throw new Error(`Cannot create ${path}`)
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const handle = await this.fileHandle(path, false)
    if (!handle) throw new Error(`No file at ${path}`)
    return new Uint8Array(await (await handle.getFile()).arrayBuffer())
  }

  async writeBinary(path: string, contents: Uint8Array): Promise<void> {
    const handle = await this.fileHandle(path, true)
    if (!handle) throw new Error(`Cannot create ${path}`)
    const writable = await handle.createWritable()
    await writable.write(contents as unknown as ArrayBuffer)
    await writable.close()
  }

  async list(dir: string): Promise<string[]> {
    const handle = await this.dir(dir, false)
    if (!handle) return []
    const prefix = dir === '' ? '' : `${dir}/`
    const paths: string[] = []
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'file') paths.push(`${prefix}${name}`)
    }
    return paths
  }

  async listFolders(dir: string): Promise<string[]> {
    const handle = await this.dir(dir, false)
    if (!handle) return []
    const prefix = dir === '' ? '' : `${dir}/`
    const paths: string[] = []
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'directory') paths.push(`${prefix}${name}`)
    }
    return paths
  }

  async exists(path: string): Promise<boolean> {
    return (await this.fileHandle(path, false)) !== undefined
  }

  async delete(path: string): Promise<void> {
    const slash = path.lastIndexOf('/')
    const parent = await this.dir(slash === -1 ? '' : path.slice(0, slash), false)
    await parent?.removeEntry(path.slice(slash + 1))
  }
}

const POLL_MS = 1500

export class FsaFolderWatcher implements FolderWatcher {
  private root: FileSystemDirectoryHandle

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root
  }

  watch(handler: FolderChangeHandler): () => void {
    if (typeof FileSystemObserver !== 'undefined') {
      const observer = new FileSystemObserver((records) => {
        const paths = records
          .map((r) => r.relativePathComponents.join('/'))
          .filter((p) => p !== '')
        if (paths.length) handler(paths)
      })
      void observer.observe(this.root, { recursive: true })
      return () => observer.disconnect()
    }
    return this.poll(handler)
  }

  private poll(handler: FolderChangeHandler): () => void {
    let previous: Map<string, number> | undefined
    let stopped = false
    const tick = async () => {
      if (stopped) return
      const next = await snapshotFolder(this.root)
      if (previous) {
        const changed = diffSnapshots(previous, next)
        if (changed.length) handler(changed)
      }
      previous = next
      if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS)
    }
    let timer = window.setTimeout(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }
}

async function snapshotFolder(
  root: FileSystemDirectoryHandle,
  prefix = '',
  into = new Map<string, number>(),
): Promise<Map<string, number>> {
  for await (const [name, entry] of root.entries()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      into.set(`${prefix}${name}`, file.lastModified)
    } else {
      await snapshotFolder(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, into)
    }
  }
  return into
}

/** Paths added, removed, or with a new modification time. */
export function diffSnapshots(previous: Map<string, number>, next: Map<string, number>): string[] {
  const changed: string[] = []
  for (const [path, mtime] of next) {
    if (previous.get(path) !== mtime) changed.push(path)
  }
  for (const path of previous.keys()) {
    if (!next.has(path)) changed.push(path)
  }
  return changed
}

/* ---------- IndexedDB: recents (directory handles) and the journal ---------- */

const DB_NAME = 'storyline-app'
const STORE = 'recent-folders'
const JOURNAL_STORE = 'journal'

/**
 * Version 1 (stage 1) held only recents; version 2 adds the journal.
 * Upgrades create whatever store is missing and touch nothing else, so
 * a folder remembered under version 1 is still remembered.
 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' })
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        db.createObjectStore(JOURNAL_STORE, { keyPath: ['folder', 'path'] })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error as Error)
  })
}

interface RecentRow {
  name: string
  handle: FileSystemDirectoryHandle
  openedAt: number
}

function inStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName = STORE,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(storeName, mode).objectStore(storeName))
        request.onsuccess = () => {
          db.close()
          resolve(request.result)
        }
        request.onerror = () => {
          db.close()
          reject(request.error as Error)
        }
      }),
  )
}

/** The write-ahead journal, one row per (folder, path), in the shared app database. */
export class IdbJournal implements Journal {
  private folder: string

  constructor(folder: string) {
    this.folder = folder
  }

  async record(entry: JournalEntry): Promise<void> {
    await inStore('readwrite', (store) => store.put({ folder: this.folder, ...entry }), JOURNAL_STORE)
  }

  async clear(path: string): Promise<void> {
    await inStore('readwrite', (store) => store.delete([this.folder, path]), JOURNAL_STORE)
  }

  async pending(): Promise<JournalEntry[]> {
    const rows = await inStore<(JournalEntry & { folder: string })[]>(
      'readonly',
      (store) => store.getAll() as IDBRequest<(JournalEntry & { folder: string })[]>,
      JOURNAL_STORE,
    )
    return rows
      .filter((row) => row.folder === this.folder)
      .sort((a, b) => a.at - b.at)
      .map(({ folder: _folder, ...entry }) => entry)
  }
}

async function rememberFolder(name: string, handle: FileSystemDirectoryHandle): Promise<void> {
  await inStore('readwrite', (store) => store.put({ name, handle, openedAt: Date.now() } satisfies RecentRow))
}

async function recentRows(): Promise<RecentRow[]> {
  const rows = await inStore<RecentRow[]>('readonly', (store) => store.getAll() as IDBRequest<RecentRow[]>)
  return rows.sort((a, b) => b.openedAt - a.openedAt)
}

/** The directory handle behind each opened folder, for rememberOpened. */
const handles = new WeakMap<OpenedFolder, FileSystemDirectoryHandle>()

/**
 * A browser can't launch a file, but it can show one: the file's text
 * becomes a blob URL in a new tab. Playable exports are self-contained,
 * so that tab is the game.
 */
async function openInTab(files: FileAccess, path: string): Promise<void> {
  const text = await files.readText(path)
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html' }))
  if (!window.open(url, '_blank')) throw new Error('The browser blocked the new tab — allow pop-ups for this site and try again.')
}

function asOpenedFolder(name: string, handle: FileSystemDirectoryHandle): OpenedFolder {
  const files = new FsaFileAccess(handle)
  const folder: OpenedFolder = {
    name,
    files,
    watcher: new FsaFolderWatcher(handle),
    journal: new IdbJournal(name),
    open: (path) => openInTab(files, path),
  }
  handles.set(folder, handle)
  return folder
}

export function browserPlatform(): Platform {
  return {
    async pickFolder() {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('This browser has no File System Access API — use Edge or Chrome.')
      }
      let handle: FileSystemDirectoryHandle
      try {
        handle = await window.showDirectoryPicker({ id: 'story-folder', mode: 'readwrite' })
      } catch (error) {
        // Only a dismissed picker means "do nothing" — anything else the
        // user needs to read, not lose.
        if ((error as DOMException).name === 'AbortError') return null
        throw error
      }
      return asOpenedFolder(handle.name, handle)
    },

    async recents() {
      try {
        return (await recentRows()).map((row) => row.name)
      } catch {
        return []
      }
    },

    async openRecent(name) {
      const row = (await recentRows().catch(() => [] as RecentRow[])).find((r) => r.name === name)
      if (!row) return null
      const status = await row.handle.queryPermission({ mode: 'readwrite' })
      if (status !== 'granted') {
        const asked = await row.handle.requestPermission({ mode: 'readwrite' })
        if (asked !== 'granted') {
          throw new Error(`Permission to ${name} was not granted — pick the folder again instead.`)
        }
      }
      return asOpenedFolder(name, row.handle)
    },

    async rememberOpened(folder) {
      const handle = handles.get(folder)
      if (handle) await rememberFolder(folder.name, handle).catch(() => {})
    },
  }
}
