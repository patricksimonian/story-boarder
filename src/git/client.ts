import type { FileAccess, GitClient } from '../adapters/types'
import { describeChanges } from './describe'
import { commitAll, init, log, readFileAt, type RepoIdent } from './repo'

/**
 * The GitClient the app holds for one story folder. Until PAT setup
 * hands over a GitHub identity, commits are signed by the app itself —
 * the history is still real, the name upgrades later.
 */
export const DEFAULT_IDENT: RepoIdent = { name: 'Storyline', email: 'storyline@local' }

export function folderGit(files: FileAccess, ident: RepoIdent = DEFAULT_IDENT): GitClient {
  /** One walk of the folder: a boundary's message is written from the snapshot that walk took. */
  async function commit(message: string | null): Promise<string | null> {
    await init(files)
    return commitAll(files, message ?? describeChanges, ident)
  }

  return {
    commitBoundary: () => commit(null),
    checkpoint: (message) => commit(message),
    log: async (opts) =>
      (await log(files, opts)).map((c) => ({ id: c.sha, message: c.message, author: c.author, time: c.time })),
    readFileAt: (commitId, path) => readFileAt(files, commitId, path),
  }
}
