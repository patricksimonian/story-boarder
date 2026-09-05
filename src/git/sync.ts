import type { FileAccess } from '../adapters/types'
import {
  decodeCommit,
  decodeTree,
  encodeCommit,
  encodeTree,
  hasObject,
  readObject,
  writeObject,
  type CommitObject,
  type TreeEntry,
} from './objects'
import { commitAll, head, init, mergeBase, writeMainRef, type RepoIdent } from './repo'

/**
 * Sync with the user's own GitHub remote, by the standing rules: pull
 * first, never force (this interface cannot even say it — setHead moves
 * the ref only from the value the caller last saw), a divergence becomes
 * a real merge commit, and an overlap on one file is handed back as a
 * conflict for the writer, not auto-resolved.
 *
 * Every object crossing the wire is verified: git shas are content
 * derived, so the sha the remote answers with must equal the one
 * computed locally — a push to real GitHub re-proves the object encoding
 * on every commit.
 *
 * Call sync at a boundary; it expects the folder to be committed.
 */

export interface Remote {
  /** The sha refs/heads/main points at, or null for an empty repository. */
  head(): Promise<string | null>
  putBlob(content: Uint8Array): Promise<string>
  getBlob(sha: string): Promise<Uint8Array>
  putTree(entries: TreeEntry[]): Promise<string>
  getTree(sha: string): Promise<TreeEntry[]>
  putCommit(commit: CommitObject): Promise<string>
  getCommit(sha: string): Promise<CommitObject>
  /** Points main at sha, expecting to move it off `expectedOld` (null = create). */
  setHead(sha: string, expectedOld: string | null): Promise<void>
}

export interface FileConflict {
  path: string
  /** This machine's text, or null when this side deleted the file. */
  mine: string | null
  /** The remote's text, or null when that side deleted the file. */
  theirs: string | null
}

export type SyncResult =
  | { kind: 'clean' }
  | { kind: 'pushed'; commits: number }
  | { kind: 'pulled'; commits: number; changed: string[] }
  | { kind: 'merged'; pushed: boolean; conflicts: FileConflict[]; remoteHead: string }
  | { kind: 'offline' }

export async function sync(
  files: FileAccess,
  remote: Remote,
  ident: RepoIdent,
  opts: { time?: number } = {},
): Promise<SyncResult> {
  try {
    const theirs = await remote.head()
    const mine = await head(files)
    if (theirs === mine) return { kind: 'clean' }

    if (theirs === null) {
      return { kind: 'pushed', commits: await push(files, remote, mine as string, null) }
    }

    await init(files)
    const fetched = await fetchCommits(files, remote, theirs)

    if (mine === null) {
      await writeMainRef(files, theirs)
      return { kind: 'pulled', commits: fetched, changed: await applyTree(files, null, theirs) }
    }

    const base = await mergeBase(files, mine, theirs)
    if (base === theirs) {
      return { kind: 'pushed', commits: await push(files, remote, mine, theirs) }
    }
    if (base === mine) {
      await writeMainRef(files, theirs)
      return { kind: 'pulled', commits: fetched, changed: await applyTree(files, mine, theirs) }
    }

    // Diverged. Take their side of every file only they moved; anything
    // both sides moved differently goes back to the writer.
    const conflicts = await mergeWorktree(files, base, mine, theirs)
    if (conflicts.length > 0) return { kind: 'merged', pushed: false, conflicts, remoteHead: theirs }

    await completeMerge(files, theirs, ident, opts)
    await push(files, remote, (await head(files)) as string, theirs)
    return { kind: 'merged', pushed: true, conflicts: [], remoteHead: theirs }
  } catch (error) {
    // fetch signals "no network" as a TypeError; anything else is real.
    if (error instanceof TypeError) return { kind: 'offline' }
    throw error
  }
}

/**
 * Records the merge commit once every conflict is settled on disk. The
 * folder as it stands becomes the merge's tree, with both heads as
 * parents — history gains the resolution, nothing is rewritten.
 */
export async function completeMerge(
  files: FileAccess,
  remoteHead: string,
  ident: RepoIdent,
  opts: { time?: number } = {},
): Promise<string> {
  return (await commitAll(files, 'Merge remote work', ident, { ...opts, mergeParent: remoteHead })) as string
}

const readCommitLocal = async (files: FileAccess, sha: string): Promise<CommitObject> =>
  decodeCommit((await readObject(files, sha)).body)

const treeOf = async (files: FileAccess, commitSha: string): Promise<string> =>
  (await readCommitLocal(files, commitSha)).tree

/* ---------- upstream: local objects onto the remote ---------- */

async function push(files: FileAccess, remote: Remote, tip: string, remoteTip: string | null): Promise<number> {
  // Everything the remote already has, by walking its tip's ancestry.
  const known = new Set<string>()
  if (remoteTip) {
    const stack = [remoteTip]
    while (stack.length) {
      const sha = stack.pop() as string
      if (known.has(sha)) continue
      known.add(sha)
      stack.push(...(await readCommitLocal(files, sha)).parents)
    }
  }

  // Ours alone, discovered child-first; uploaded in reverse, parents first.
  const order: string[] = []
  const stack = [tip]
  while (stack.length) {
    const sha = stack.pop() as string
    if (known.has(sha) || order.includes(sha)) continue
    order.push(sha)
    stack.push(...(await readCommitLocal(files, sha)).parents)
  }

  const sent = new Set<string>()
  for (const sha of [...order].reverse()) {
    const commit = await readCommitLocal(files, sha)
    await uploadTree(files, remote, commit.tree, sent)
    const answered = await remote.putCommit(commit)
    if (answered !== sha) throw new Error(`Pushed commit ${sha} but the remote hashed it to ${answered}`)
  }
  await remote.setHead(tip, remoteTip)
  return order.length
}

async function uploadTree(files: FileAccess, remote: Remote, treeSha: string, sent: Set<string>): Promise<void> {
  if (sent.has(treeSha)) return
  const entries = decodeTree((await readObject(files, treeSha)).body)
  for (const entry of entries) {
    if (entry.mode === '40000') {
      await uploadTree(files, remote, entry.sha, sent)
    } else if (!sent.has(entry.sha)) {
      const answered = await remote.putBlob((await readObject(files, entry.sha)).body)
      if (answered !== entry.sha) throw new Error(`Pushed blob ${entry.sha} but the remote hashed it to ${answered}`)
      sent.add(entry.sha)
    }
  }
  const answered = await remote.putTree(entries)
  if (answered !== treeSha) throw new Error(`Pushed tree ${treeSha} but the remote hashed it to ${answered}`)
  sent.add(treeSha)
}

/* ---------- downstream: remote objects into the local store ---------- */

/** Downloads commits (and their trees) until reaching history we hold; counts the new ones. */
async function fetchCommits(files: FileAccess, remote: Remote, tip: string): Promise<number> {
  let fetched = 0
  const stack = [tip]
  while (stack.length) {
    const sha = stack.pop() as string
    if (await hasObject(files, sha)) continue
    const commit = await remote.getCommit(sha)
    await fetchTree(files, remote, commit.tree)
    const written = await writeObject(files, 'commit', encodeCommit(commit))
    if (written !== sha) throw new Error(`Remote commit ${sha} hashed to ${written} — refusing the download`)
    fetched++
    stack.push(...commit.parents)
  }
  return fetched
}

async function fetchTree(files: FileAccess, remote: Remote, treeSha: string): Promise<void> {
  if (await hasObject(files, treeSha)) return
  const entries = await remote.getTree(treeSha)
  for (const entry of entries) {
    if (entry.mode === '40000') {
      await fetchTree(files, remote, entry.sha)
    } else if (!(await hasObject(files, entry.sha))) {
      const written = await writeObject(files, 'blob', await remote.getBlob(entry.sha))
      if (written !== entry.sha) throw new Error(`Remote blob ${entry.sha} hashed to ${written} — refusing the download`)
    }
  }
  const written = await writeObject(files, 'tree', encodeTree(entries))
  if (written !== treeSha) throw new Error(`Remote tree ${treeSha} hashed to ${written} — refusing the download`)
}

/* ---------- the worktree ---------- */

/** Every file a commit's tree holds, as path → blob sha. */
async function treeBlobs(files: FileAccess, treeSha: string, prefix = ''): Promise<Map<string, string>> {
  const blobs = new Map<string, string>()
  for (const entry of decodeTree((await readObject(files, treeSha)).body)) {
    if (entry.mode === '40000') {
      for (const [path, sha] of await treeBlobs(files, entry.sha, `${prefix}${entry.name}/`)) blobs.set(path, sha)
    } else {
      blobs.set(`${prefix}${entry.name}`, entry.sha)
    }
  }
  return blobs
}

/** Lays the difference between two commits onto the disk; resolves to the paths touched. */
async function applyTree(files: FileAccess, fromCommit: string | null, toCommit: string): Promise<string[]> {
  const before = fromCommit ? await treeBlobs(files, await treeOf(files, fromCommit)) : new Map<string, string>()
  const after = await treeBlobs(files, await treeOf(files, toCommit))
  const changed: string[] = []
  for (const [path, sha] of after) {
    if (before.get(path) === sha) continue
    await files.writeBinary(path, (await readObject(files, sha)).body)
    changed.push(path)
  }
  for (const path of before.keys()) {
    if (after.has(path)) continue
    await files.delete(path)
    changed.push(path)
  }
  return changed
}

/** Three-way merge onto the worktree; hands back the files both sides moved differently. */
async function mergeWorktree(
  files: FileAccess,
  base: string | null,
  mine: string,
  theirs: string,
): Promise<FileConflict[]> {
  const baseBlobs = base ? await treeBlobs(files, await treeOf(files, base)) : new Map<string, string>()
  const mineBlobs = await treeBlobs(files, await treeOf(files, mine))
  const theirBlobs = await treeBlobs(files, await treeOf(files, theirs))

  const text = async (sha: string | undefined) =>
    sha === undefined ? null : new TextDecoder().decode((await readObject(files, sha)).body)

  const conflicts: FileConflict[] = []
  for (const path of new Set([...baseBlobs.keys(), ...mineBlobs.keys(), ...theirBlobs.keys()])) {
    const b = baseBlobs.get(path)
    const m = mineBlobs.get(path)
    const t = theirBlobs.get(path)
    if (m === t || t === b) continue // agreed, or only this machine moved it
    if (m === b) {
      // Only the remote moved it — follow.
      if (t === undefined) await files.delete(path)
      else await files.writeBinary(path, (await readObject(files, t)).body)
    } else {
      conflicts.push({ path, mine: await text(m), theirs: await text(t) })
    }
  }
  return conflicts
}
