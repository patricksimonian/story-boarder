/**
 * The three seams the app talks to the outside world through. Browser
 * implementations arrive at their build stages (File System Access API,
 * FileSystemObserver/polling, embedded JS git + GitHub REST); a desktop
 * shell would swap these without touching anything above them.
 *
 * All paths are relative to the story folder root, forward-slashed.
 */

export interface FileAccess {
  readText(path: string): Promise<string>
  writeText(path: string, contents: string): Promise<void>
  readBinary(path: string): Promise<Uint8Array>
  writeBinary(path: string, contents: Uint8Array): Promise<void>
  /** File paths directly under `dir`, non-recursive. */
  list(dir: string): Promise<string[]>
  /** Folder paths directly under `dir`, non-recursive. */
  listFolders(dir: string): Promise<string[]>
  exists(path: string): Promise<boolean>
  delete(path: string): Promise<void>
}

export type FolderChangeHandler = (paths: string[]) => void

export interface FolderWatcher {
  /** Starts watching the story folder; returns an unsubscribe. */
  watch(handler: FolderChangeHandler): () => void
}

/** Grows again with sync: push and pull arrive with the GitHub remote. */
export interface GitClient {
  /** Commits everything changed under a generated message; null when the folder is clean. */
  commitBoundary(): Promise<string | null>
  /** Commits everything changed under the writer's own words; null when the folder is clean. */
  checkpoint(message: string): Promise<string | null>
  /** Commits from newest back; with a path, only commits where that file changed. */
  log(opts?: { limit?: number; path?: string }): Promise<GitCommit[]>
  /** The file's text as a commit held it, or null when that commit has no such file. */
  readFileAt(commitId: string, path: string): Promise<string | null>
}

export interface GitCommit {
  id: string
  message: string
  author: string
  /** Seconds since the epoch. */
  time: number
}

/**
 * The write-ahead journal behind the editor: every keystroke lands here
 * within milliseconds, in browser-local storage scoped to one story
 * folder. An entry holds the whole file as it should be on disk plus the
 * disk text it was edited from, so a relaunch can tell whether the disk
 * moved while the app was gone. Entries clear only after a confirmed
 * disk write.
 */
export interface JournalEntry {
  path: string
  /** The file as it read on disk when this edit began (or was last saved). */
  baseText: string
  /** The file as the editor holds it now. */
  text: string
  at: number
}

export interface Journal {
  record(entry: JournalEntry): Promise<void>
  clear(path: string): Promise<void>
  /** Everything not yet confirmed on disk, oldest first. */
  pending(): Promise<JournalEntry[]>
}

/** A story folder the user has opened: its access, its watcher, its journal. */
export interface OpenedFolder {
  name: string
  files: FileAccess
  watcher: FolderWatcher
  journal: Journal
}

/**
 * How the app reaches folders at all: the browser build uses the File
 * System Access API and IndexedDB-persisted handles; tests hand in
 * in-memory folders.
 */
export interface Platform {
  /**
   * Shows the folder picker. Resolves null only when the user cancels;
   * any real failure rejects with a message the app shows on the start
   * screen. Picking is not validation — the app checks for story.json
   * and calls rememberOpened only when the folder actually opened.
   */
  pickFolder(): Promise<OpenedFolder | null>
  /** Names of story folders opened before, newest first. */
  recents(): Promise<string[]>
  /**
   * Reopens a recent by name. Rejects with a reason the user can read
   * (permission not granted, folder gone) rather than resolving null;
   * null only when the name is unknown.
   */
  openRecent(name: string): Promise<OpenedFolder | null>
  /** Records a folder that opened successfully, for the recents list. */
  rememberOpened(folder: OpenedFolder): Promise<void>
}
