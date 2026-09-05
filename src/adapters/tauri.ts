import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { IdbJournal } from './browser'
import type {
  FileAccess,
  FolderChangeHandler,
  FolderWatcher,
  OpenedFolder,
  Platform,
} from './types'

/**
 * The desktop platform: the same Platform interface the browser build
 * implements, with each call carried to the Rust shell in `src-tauri/`.
 * The shell does the disk work — a native folder picker, atomic writes,
 * a recursive watcher, recents as a JSON file — and refuses any folder
 * the page didn't open through it. The keystroke journal stays in
 * IndexedDB: WebView2 has one, and the reconciliation logic above it is
 * shared with the browser build unchanged.
 */

export { isTauri }

interface FolderInfo {
  name: string
  path: string
}

/** Tauri rejects with the command's error string; the app expects an Error. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export class TauriFileAccess implements FileAccess {
  private root: string

  constructor(root: string) {
    this.root = root
  }

  readText(path: string): Promise<string> {
    return call('read_text', { root: this.root, path })
  }

  writeText(path: string, contents: string): Promise<void> {
    return call('write_text', { root: this.root, path, contents })
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const buffer = await call<ArrayBuffer>('read_binary', { root: this.root, path })
    return new Uint8Array(buffer)
  }

  /** Bytes go as the raw request body; root and path ride in headers. */
  async writeBinary(path: string, contents: Uint8Array): Promise<void> {
    try {
      await invoke('write_binary', contents, {
        headers: { 'x-root': encodeURIComponent(this.root), 'x-path': encodeURIComponent(path) },
      })
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  list(dir: string): Promise<string[]> {
    return call('list_files', { root: this.root, dir })
  }

  listFolders(dir: string): Promise<string[]> {
    return call('list_folders', { root: this.root, dir })
  }

  exists(path: string): Promise<boolean> {
    return call('exists', { root: this.root, path })
  }

  delete(path: string): Promise<void> {
    return call('delete_entry', { root: this.root, path })
  }
}

interface Changed {
  root: string
  paths: string[]
}

export class TauriFolderWatcher implements FolderWatcher {
  private root: string

  constructor(root: string) {
    this.root = root
  }

  watch(handler: FolderChangeHandler): () => void {
    let stopped = false
    const unlisten = listen<Changed>('folder-changed', (event) => {
      if (stopped || event.payload.root !== this.root) return
      if (event.payload.paths.length) handler(event.payload.paths)
    })
    void call('watch_folder', { root: this.root })
    return () => {
      stopped = true
      void unlisten.then((off) => off())
      void call('unwatch_folder', { root: this.root }).catch(() => {})
    }
  }
}

/** The absolute path behind each opened folder, for rememberOpened. */
const roots = new WeakMap<OpenedFolder, string>()

function asOpenedFolder(info: FolderInfo): OpenedFolder {
  const folder: OpenedFolder = {
    name: info.name,
    files: new TauriFileAccess(info.path),
    watcher: new TauriFolderWatcher(info.path),
    journal: new IdbJournal(info.path),
  }
  roots.set(folder, info.path)
  return folder
}

export function tauriPlatform(): Platform {
  return {
    async pickFolder() {
      const info = await call<FolderInfo | null>('pick_folder')
      return info ? asOpenedFolder(info) : null
    },

    async recents() {
      try {
        const rows = await call<{ name: string }[]>('recents')
        return rows.map((row) => row.name)
      } catch {
        return []
      }
    },

    async openRecent(name) {
      const info = await call<FolderInfo | null>('open_recent', { name })
      return info ? asOpenedFolder(info) : null
    },

    async rememberOpened(folder) {
      const root = roots.get(folder)
      if (root) await call('remember_opened', { root }).catch(() => {})
    },
  }
}
