import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { commitAll, init, log } from './repo'

/**
 * The claim under test: a story folder this app has been committing is a
 * real git repository. So build one in memory, lay it onto a real disk
 * byte for byte, and let actual git be the judge — fsck it, walk its
 * log, read a file out of history. Skipped politely on a machine with
 * no git; everywhere else, this is the interop contract.
 */

const IDENT = { name: 'Test Author', email: 'test@example.com' }

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'])
    return true
  } catch {
    return false
  }
})()

async function dump(files: InMemoryFileAccess, into: string, dir = ''): Promise<void> {
  for (const path of await files.list(dir)) {
    const target = join(into, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, await files.readBinary(path))
  }
  for (const folder of await files.listFolders(dir)) {
    await dump(files, into, folder)
  }
}

const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!hasGit)('real git reading our repository', () => {
  it('fscks clean and agrees on log, content, and history', async () => {
    const files = new InMemoryFileAccess()
    await files.writeText('story.json', '{ "title": "Interop" }\n')
    await files.writeText('scenes/the-dry-cistern.md', '# The Dry Cistern\n\nMara talks first.\n')
    await init(files)
    const first = await commitAll(files, 'First commit', IDENT, { time: 1700000000 })

    await files.writeText('scenes/the-dry-cistern.md', '# The Dry Cistern\n\nMara talks second.\n')
    const second = await commitAll(files, 'Edit scene: The Dry Cistern', IDENT, { time: 1700000100 })

    await files.delete('story.json')
    const third = await commitAll(files, 'Drop the manifest', IDENT, { time: 1700000200 })

    const dir = mkdtempSync(join(tmpdir(), 'storyline-git-'))
    tempDirs.push(dir)
    await dump(files, dir)

    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir }).toString()

    // fsck --strict throws on any malformed or missing object; silence is a pass.
    git('fsck', '--strict')

    expect(git('log', '--format=%H').trim().split('\n')).toEqual([third, second, first])
    expect(git('log', '--format=%s', '-1').trim()).toBe('Drop the manifest')
    expect(git('cat-file', 'blob', `${first}:scenes/the-dry-cistern.md`)).toBe(
      '# The Dry Cistern\n\nMara talks first.\n',
    )
    expect(git('cat-file', 'blob', `${second}:scenes/the-dry-cistern.md`)).toBe(
      '# The Dry Cistern\n\nMara talks second.\n',
    )

    // And the mirror of our log() — both implementations, one history.
    const ours = await log(files)
    expect(ours.map((c) => c.sha)).toEqual([third, second, first])
  })
})
