import type { FileAccess } from '../adapters/types'
import type { FileChange } from './describe'
import {
  decodeCommit,
  decodeTree,
  encodeCommit,
  encodeTree,
  hashObject,
  readObject,
  writeObject,
  type CommitObject,
  type TreeEntry,
} from './objects'

/**
 * The repository over the story folder: refs, whole-folder commits, the
 * log, and reads from history. Commits snapshot everything except .git
 * itself — the walk writes blobs and trees as it goes, and since the
 * store is content-addressed, an unchanged file costs nothing and an
 * unchanged folder produces no objects at all, just a declined commit.
 *
 * Timestamps are recorded in UTC ('+0000'); the zone on a commit line
 * is cosmetic and one zone keeps commits reproducible.
 */

export interface RepoIdent {
  name: string
  email: string
}

export interface CommitMeta {
  sha: string
  message: string
  author: string
  /** Seconds since the epoch. */
  time: number
  parents: string[]
}

const HEAD_PATH = '.git/HEAD'
const MAIN_REF = '.git/refs/heads/main'

/** Marks the folder as a git repository; an existing repo is left alone. */
export async function init(files: FileAccess): Promise<void> {
  if (await files.exists(HEAD_PATH)) return
  await files.writeText(HEAD_PATH, 'ref: refs/heads/main\n')
  await files.writeText(
    '.git/config',
    '[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n',
  )
}

/** The commit main points at, or null before the first commit. */
export async function head(files: FileAccess): Promise<string | null> {
  if (!(await files.exists(MAIN_REF))) return null
  return (await files.readText(MAIN_REF)).trim()
}

async function readCommit(files: FileAccess, sha: string): Promise<CommitObject> {
  return decodeCommit((await readObject(files, sha)).body)
}

/** Blobs and trees for one folder level; resolves to the tree's sha, or null when empty. */
async function snapshotTree(files: FileAccess, dir: string): Promise<string | null> {
  const entries: TreeEntry[] = []
  for (const path of await files.list(dir)) {
    const sha = await writeObject(files, 'blob', await files.readBinary(path))
    entries.push({ mode: '100644', name: path.slice(path.lastIndexOf('/') + 1), sha })
  }
  for (const folder of await files.listFolders(dir)) {
    if (folder === '.git') continue
    const sha = await snapshotTree(files, folder)
    if (sha) entries.push({ mode: '40000', name: folder.slice(folder.lastIndexOf('/') + 1), sha })
  }
  if (dir !== '' && entries.length === 0) return null
  return writeObject(files, 'tree', encodeTree(entries))
}

/** Points main at a commit the object store already holds. */
export async function writeMainRef(files: FileAccess, sha: string): Promise<void> {
  await files.writeText(MAIN_REF, `${sha}\n`)
}

/**
 * Commits the whole folder. Resolves to the new commit's sha — or null,
 * declining, when the folder matches what main already points at. With
 * `mergeParent` it always commits, carrying two parents: a merge must be
 * recorded even when its tree matches one side.
 *
 * The message is a string, or a function of what the commit holds
 * against its parent. The function is handed the snapshot's own blobs,
 * never a second look at the folder: the app keeps writing while a walk
 * is out, and a message read from the folder afterwards would describe
 * a file the commit never held.
 */
export async function commitAll(
  files: FileAccess,
  message: string | ((changes: FileChange[]) => string),
  ident: RepoIdent,
  opts: { time?: number; mergeParent?: string } = {},
): Promise<string | null> {
  const tree = (await snapshotTree(files, '')) as string
  const parent = await head(files)
  const parentTree = parent ? (await readCommit(files, parent)).tree : null
  if (!opts.mergeParent && parentTree === tree) return null
  const text = typeof message === 'string' ? message : message(await changesBetween(files, parentTree, tree))

  const time = opts.time ?? Math.floor(Date.now() / 1000)
  const who = { ...ident, time, tz: '+0000' }
  const parents = parent ? [parent] : []
  if (opts.mergeParent) parents.push(opts.mergeParent)
  const commit: CommitObject = {
    tree,
    parents,
    author: who,
    committer: who,
    message: text,
  }
  const sha = await writeObject(files, 'commit', encodeCommit(commit))
  await writeMainRef(files, sha)
  return sha
}

/** The blob a commit holds at a path, or null when nothing is there. */
async function blobShaAt(files: FileAccess, commitSha: string, path: string): Promise<string | null> {
  return blobShaInTree(files, (await readCommit(files, commitSha)).tree, path)
}

/**
 * One tree against another (or against nothing), as before/after texts
 * read from the object store — what the commit-message generator wants
 * to hear about, taken from what the commit actually holds.
 */
async function changesBetween(files: FileAccess, beforeTree: string | null, afterTree: string): Promise<FileChange[]> {
  const text = async (sha: string | null) => (sha ? new TextDecoder().decode((await readObject(files, sha)).body) : null)
  const changes: FileChange[] = []
  const after = await treePaths(files, afterTree, '')
  for (const path of after) {
    const now = await blobShaInTree(files, afterTree, path)
    const then = beforeTree ? await blobShaInTree(files, beforeTree, path) : null
    if (now !== then) changes.push({ path, before: await text(then), after: await text(now) })
  }
  if (beforeTree) {
    const held = new Set(after)
    for (const path of await treePaths(files, beforeTree, '')) {
      if (!held.has(path)) changes.push({ path, before: await text(await blobShaInTree(files, beforeTree, path)), after: null })
    }
  }
  return changes
}

/** The blob a tree holds at a path, or null when nothing is there. */
async function blobShaInTree(files: FileAccess, treeSha: string, path: string): Promise<string | null> {
  let sha = treeSha
  const parts = path.split('/')
  for (let i = 0; i < parts.length; i++) {
    const wantDir = i < parts.length - 1
    const entry = decodeTree((await readObject(files, sha)).body).find(
      (e) => e.name === parts[i] && (e.mode === '40000') === wantDir,
    )
    if (!entry) return null
    sha = entry.sha
  }
  return sha
}

/**
 * Commits reachable from main, newest first by time (ties keep walk
 * order, so a child never trails its parent). Both parents of a merge
 * are walked — work pulled from another machine belongs in the story's
 * timeline too. With a path, only commits where that file changed
 * against the first parent — a creation and a deletion both count.
 */
export async function log(
  files: FileAccess,
  opts: { limit?: number; path?: string } = {},
): Promise<CommitMeta[]> {
  const start = await head(files)
  if (!start) return []

  const commits: CommitMeta[] = []
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length) {
    const sha = queue.shift() as string
    if (seen.has(sha)) continue
    seen.add(sha)
    const commit = await readCommit(files, sha)
    let include = true
    if (opts.path !== undefined) {
      const now = await blobShaAt(files, sha, opts.path)
      const before = commit.parents.length ? await blobShaAt(files, commit.parents[0], opts.path) : null
      include = now !== before
    }
    if (include) {
      commits.push({
        sha,
        message: commit.message,
        author: commit.author.name,
        time: commit.author.time,
        parents: commit.parents,
      })
    }
    queue.push(...commit.parents)
  }
  commits.sort((a, b) => b.time - a.time)
  return opts.limit === undefined ? commits : commits.slice(0, opts.limit)
}

/** The file's text as a commit held it, or null when the commit has no such file. */
export async function readFileAt(files: FileAccess, commitSha: string, path: string): Promise<string | null> {
  const sha = await blobShaAt(files, commitSha, path)
  if (!sha) return null
  return new TextDecoder().decode((await readObject(files, sha)).body)
}

/** Every file path in the folder — .git and Chromium's transient .crswap files excluded. */
async function worktreePaths(files: FileAccess, dir = ''): Promise<string[]> {
  const paths = (await files.list(dir)).filter((path) => !path.endsWith('.crswap'))
  for (const folder of await files.listFolders(dir)) {
    if (folder === '.git') continue
    paths.push(...(await worktreePaths(files, folder)))
  }
  return paths
}

/**
 * Every file path a tree holds, recursively — the files at each level
 * before its folders, the order the folder walk reads in, so story.json
 * leads a commit message the way it always has.
 */
async function treePaths(files: FileAccess, treeSha: string, prefix: string): Promise<string[]> {
  const entries = decodeTree((await readObject(files, treeSha)).body)
  const paths = entries.filter((e) => e.mode !== '40000').map((e) => `${prefix}${e.name}`)
  for (const entry of entries) {
    if (entry.mode === '40000') paths.push(...(await treePaths(files, entry.sha, `${prefix}${entry.name}/`)))
  }
  return paths
}

/**
 * The folder against a commit (or against nothing), as before/after
 * texts — what the commit-message generator wants to hear about.
 */
export async function changedSince(files: FileAccess, commitSha: string | null): Promise<FileChange[]> {
  const changes: FileChange[] = []
  const present = await worktreePaths(files)
  for (const path of present) {
    // One read serves both the hash and the text. The text is decoded
    // the way readFileAt decodes the other side: leniently, because an
    // image under assets/ is a change worth naming and never worth
    // reading — and the desktop shell refuses to read it as text.
    const bytes = await files.readBinary(path)
    const now = await hashObject('blob', bytes)
    const then = commitSha ? await blobShaAt(files, commitSha, path) : null
    if (now === then) continue
    changes.push({
      path,
      before: commitSha && then ? await readFileAt(files, commitSha, path) : null,
      after: new TextDecoder().decode(bytes),
    })
  }
  if (commitSha) {
    const held = new Set(present)
    for (const path of await treePaths(files, (await readCommit(files, commitSha)).tree, '')) {
      if (!held.has(path)) changes.push({ path, before: await readFileAt(files, commitSha, path), after: null })
    }
  }
  return changes
}

/**
 * The nearest common ancestor of two commits, or null when they share
 * none. Every parent of a merge counts — one machine's tip can be the
 * other machine's second parent.
 */
export async function mergeBase(files: FileAccess, a: string, b: string): Promise<string | null> {
  const ancestors = new Set<string>()
  const stack = [a]
  while (stack.length) {
    const sha = stack.pop() as string
    if (ancestors.has(sha)) continue
    ancestors.add(sha)
    stack.push(...(await readCommit(files, sha)).parents)
  }
  const seen = new Set<string>()
  const queue = [b]
  while (queue.length) {
    const sha = queue.shift() as string
    if (ancestors.has(sha)) return sha
    if (seen.has(sha)) continue
    seen.add(sha)
    queue.push(...(await readCommit(files, sha)).parents)
  }
  return null
}

// hashObject is re-exported for callers comparing content without writing.
export { hashObject }
