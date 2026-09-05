import { describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { changedSince, commitAll, head, init, log, mergeBase, readFileAt } from './repo'

/**
 * The pinned shas mirror the scratch repo built with real git 2.45:
 * hello.txt + scenes/cistern.md committed by Test Author at 1700000000,
 * then hello.txt edited at 1700000100. Same folder, same ident, same
 * times — this repo layer must land on the same commits.
 */

const IDENT = { name: 'Test Author', email: 'test@example.com' }
const FIRST = '84f0628539f6de1ce069e169162fcf084eba7dbb'
const SECOND = 'd774dc36c9f0e9726f0dcb4ef81d9e44edb29c6d'

async function fixtureFolder(): Promise<InMemoryFileAccess> {
  const files = new InMemoryFileAccess()
  await files.writeText('hello.txt', 'hello world\n')
  await files.writeText('scenes/cistern.md', '# The Dry Cistern\n')
  await init(files)
  return files
}

describe('init and head', () => {
  it('lays down HEAD pointing at main; head is null before any commit', async () => {
    const files = new InMemoryFileAccess()
    await init(files)
    expect(await files.readText('.git/HEAD')).toBe('ref: refs/heads/main\n')
    expect(await head(files)).toBeNull()
  })

  it('leaves an existing repo alone', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await init(files)
    expect(await head(files)).toBe(FIRST)
  })
})

describe('commitAll', () => {
  it('reaches the exact sha real git made of the same folder', async () => {
    const files = await fixtureFolder()
    expect(await commitAll(files, 'First commit', IDENT, { time: 1700000000 })).toBe(FIRST)
    expect(await head(files)).toBe(FIRST)
  })

  it('chains the second commit onto the first, again matching git', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    expect(await commitAll(files, 'Edit hello', IDENT, { time: 1700000100 })).toBe(SECOND)
  })

  it('declines to commit an unchanged folder', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    expect(await commitAll(files, 'Nothing happened', IDENT, { time: 1700000100 })).toBeNull()
    expect(await head(files)).toBe(FIRST)
  })

  it('never sweeps .git itself into the tree', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    // A second commit of the untouched folder would now see .git files if
    // the walk included them — the unchanged check doubles as the probe.
    expect(await commitAll(files, 'Still nothing', IDENT, { time: 1700000200 })).toBeNull()
  })
})

describe('log', () => {
  it('lists commits newest first with message, author, time, parents', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    await commitAll(files, 'Edit hello', IDENT, { time: 1700000100 })

    const commits = await log(files)
    expect(commits.map((c) => c.sha)).toEqual([SECOND, FIRST])
    expect(commits[0]).toMatchObject({ message: 'Edit hello', author: 'Test Author', time: 1700000100, parents: [FIRST] })
    expect(commits[1].parents).toEqual([])
  })

  it('filters by path: only commits where that file changed', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    await commitAll(files, 'Edit hello', IDENT, { time: 1700000100 })

    expect((await log(files, { path: 'hello.txt' })).map((c) => c.message)).toEqual(['Edit hello', 'First commit'])
    expect((await log(files, { path: 'scenes/cistern.md' })).map((c) => c.message)).toEqual(['First commit'])
  })

  it('counts a deletion as the file changing', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.delete('scenes/cistern.md')
    await commitAll(files, 'Drop the cistern', IDENT, { time: 1700000100 })

    expect((await log(files, { path: 'scenes/cistern.md' })).map((c) => c.message)).toEqual([
      'Drop the cistern',
      'First commit',
    ])
  })

  it('honors a limit', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    await commitAll(files, 'Edit hello', IDENT, { time: 1700000100 })
    expect((await log(files, { limit: 1 })).map((c) => c.sha)).toEqual([SECOND])
  })
})

describe('readFileAt', () => {
  it('reads a file as a given commit held it', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    await commitAll(files, 'Edit hello', IDENT, { time: 1700000100 })

    expect(await readFileAt(files, FIRST, 'hello.txt')).toBe('hello world\n')
    expect(await readFileAt(files, SECOND, 'hello.txt')).toBe('hello world again\n')
    expect(await readFileAt(files, FIRST, 'scenes/cistern.md')).toBe('# The Dry Cistern\n')
  })

  it('resolves null for a path the commit does not hold', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    expect(await readFileAt(files, FIRST, 'scenes/nowhere.md')).toBeNull()
    expect(await readFileAt(files, FIRST, 'no-such-dir/thing.md')).toBeNull()
  })
})

describe('changedSince', () => {
  it('sees every file as new against no commit at all', async () => {
    const files = await fixtureFolder()
    const changes = await changedSince(files, null)
    expect(changes.map((c) => c.path).sort()).toEqual(['hello.txt', 'scenes/cistern.md'])
    expect(changes.every((c) => c.before === null)).toBe(true)
    expect(changes.find((c) => c.path === 'hello.txt')?.after).toBe('hello world\n')
  })

  it('reports an edit with both sides of the file', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    expect(await changedSince(files, FIRST)).toEqual([
      { path: 'hello.txt', before: 'hello world\n', after: 'hello world again\n' },
    ])
  })

  it('reports a deletion and an addition', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.delete('scenes/cistern.md')
    await files.writeText('scenes/rooftop.md', '# Rooftop Duel\n')
    const changes = await changedSince(files, FIRST)
    expect(changes).toContainEqual({ path: 'scenes/cistern.md', before: '# The Dry Cistern\n', after: null })
    expect(changes).toContainEqual({ path: 'scenes/rooftop.md', before: null, after: '# Rooftop Duel\n' })
    expect(changes).toHaveLength(2)
  })

  it('reports nothing for an untouched folder — .git included', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    expect(await changedSince(files, FIRST)).toEqual([])
  })
})

describe('mergeBase', () => {
  it('is the older commit when one descends from the other', async () => {
    const files = await fixtureFolder()
    await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
    await files.writeText('hello.txt', 'hello world again\n')
    await commitAll(files, 'Edit hello', IDENT, { time: 1700000100 })

    expect(await mergeBase(files, FIRST, SECOND)).toBe(FIRST)
    expect(await mergeBase(files, SECOND, FIRST)).toBe(FIRST)
    expect(await mergeBase(files, SECOND, SECOND)).toBe(SECOND)
  })
})
