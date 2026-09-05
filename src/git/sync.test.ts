import { describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { FakeGitHub } from '../test/fakeGitHub'
import { commitAll, head, init, log, readFileAt } from './repo'
import { completeMerge, sync } from './sync'

/**
 * Sync against a remote that hashes like GitHub does. The standing
 * rules: pull first, never force (the Remote interface cannot even say
 * it), a divergence becomes a real merge commit, and an overlap on one
 * file surfaces as a conflict instead of being auto-resolved.
 */

const IDENT = { name: 'Test Author', email: 'test@example.com' }

async function machineA(): Promise<InMemoryFileAccess> {
  const files = new InMemoryFileAccess()
  await files.writeText('story.json', '{ "title": "Sync" }\n')
  await files.writeText('scenes/one.md', '# One\n\nFirst text.\n')
  await init(files)
  await commitAll(files, 'First commit', IDENT, { time: 1700000000 })
  return files
}

describe('pushing', () => {
  it('lands the first push on an empty remote, shas matching', async () => {
    const files = await machineA()
    const remote = new FakeGitHub()

    expect(await sync(files, remote, IDENT)).toEqual({ kind: 'pushed', commits: 1 })
    expect(await remote.head()).toBe(await head(files))
  })

  it('pushes only what the remote lacks, and says clean when nothing is new', async () => {
    const files = await machineA()
    const remote = new FakeGitHub()
    await sync(files, remote, IDENT)

    await files.writeText('scenes/one.md', '# One\n\nSecond text.\n')
    await commitAll(files, 'Edit one', IDENT, { time: 1700000100 })
    expect(await sync(files, remote, IDENT)).toEqual({ kind: 'pushed', commits: 1 })
    expect(await remote.head()).toBe(await head(files))

    expect(await sync(files, remote, IDENT)).toEqual({ kind: 'clean' })
  })
})

describe('pulling', () => {
  it('clones into an empty folder: files, history, and the repo itself', async () => {
    const a = await machineA()
    const remote = new FakeGitHub()
    await sync(a, remote, IDENT)

    const b = new InMemoryFileAccess()
    const result = await sync(b, remote, IDENT)
    expect(result).toMatchObject({ kind: 'pulled', commits: 1 })
    expect(await b.readText('story.json')).toBe('{ "title": "Sync" }\n')
    expect(await b.readText('scenes/one.md')).toBe('# One\n\nFirst text.\n')
    expect(await head(b)).toBe(await head(a))
    expect((await log(b)).map((c) => c.message)).toEqual(['First commit'])
  })

  it('fast-forwards a machine that fell behind, updating the disk', async () => {
    const a = await machineA()
    const remote = new FakeGitHub()
    await sync(a, remote, IDENT)
    const b = new InMemoryFileAccess()
    await sync(b, remote, IDENT)

    await a.writeText('scenes/one.md', '# One\n\nRewritten on A.\n')
    await a.writeText('scenes/two.md', '# Two\n\nNew on A.\n')
    await commitAll(a, 'Work on A', IDENT, { time: 1700000200 })
    await sync(a, remote, IDENT)

    const result = await sync(b, remote, IDENT)
    expect(result).toMatchObject({ kind: 'pulled', commits: 1 })
    expect((result as { changed: string[] }).changed.sort()).toEqual(['scenes/one.md', 'scenes/two.md'])
    expect(await b.readText('scenes/one.md')).toBe('# One\n\nRewritten on A.\n')
    expect(await b.readText('scenes/two.md')).toBe('# Two\n\nNew on A.\n')
    expect(await head(b)).toBe(await head(a))
  })
})

describe('diverging', () => {
  it('merges non-overlapping work and pushes the merge', async () => {
    const a = await machineA()
    const remote = new FakeGitHub()
    await sync(a, remote, IDENT)
    const b = new InMemoryFileAccess()
    await sync(b, remote, IDENT)

    await a.writeText('scenes/one.md', '# One\n\nA’s rewrite.\n')
    await commitAll(a, 'Work on A', IDENT, { time: 1700000200 })
    await sync(a, remote, IDENT)

    await b.writeText('story.json', '{ "title": "Sync, renamed on B" }\n')
    await commitAll(b, 'Work on B', IDENT, { time: 1700000300 })

    const result = await sync(b, remote, IDENT, { time: 1700000400 })
    expect(result).toMatchObject({ kind: 'merged', conflicts: [], pushed: true })
    expect(await b.readText('scenes/one.md')).toBe('# One\n\nA’s rewrite.\n')
    expect(await b.readText('story.json')).toBe('{ "title": "Sync, renamed on B" }\n')
    expect(await remote.head()).toBe(await head(b))
    expect((await log(b))[0].parents).toHaveLength(2)
  })

  it('surfaces an overlap as a conflict, holds the push, and completes after resolution', async () => {
    const a = await machineA()
    const remote = new FakeGitHub()
    await sync(a, remote, IDENT)
    const b = new InMemoryFileAccess()
    await sync(b, remote, IDENT)

    await a.writeText('scenes/one.md', '# One\n\nA’s version.\n')
    await commitAll(a, 'Work on A', IDENT, { time: 1700000200 })
    await sync(a, remote, IDENT)
    const remoteTip = await remote.head()

    await b.writeText('scenes/one.md', '# One\n\nB’s version.\n')
    await commitAll(b, 'Work on B', IDENT, { time: 1700000300 })

    const result = await sync(b, remote, IDENT, { time: 1700000400 })
    expect(result).toMatchObject({
      kind: 'merged',
      pushed: false,
      conflicts: [{ path: 'scenes/one.md', mine: '# One\n\nB’s version.\n', theirs: '# One\n\nA’s version.\n' }],
    })
    // The remote is untouched and B's disk still holds B's words.
    expect(await remote.head()).toBe(remoteTip)
    expect(await b.readText('scenes/one.md')).toBe('# One\n\nB’s version.\n')

    // The writer resolves (keeps B's), the merge completes, the next sync pushes.
    const merged = (result as { remoteHead: string }).remoteHead
    await completeMerge(b, merged, IDENT, { time: 1700000500 })
    expect((await log(b))[0].parents).toHaveLength(2)
    expect(await sync(b, remote, IDENT)).toEqual({ kind: 'pushed', commits: 2 })
    expect(await remote.head()).toBe(await head(b))
    // A follows and ends up with B's resolution.
    await sync(a, remote, IDENT)
    expect(await a.readText('scenes/one.md')).toBe('# One\n\nB’s version.\n')
  })
})

describe('offline', () => {
  it('says offline, loses nothing, and catches up when the network returns', async () => {
    const files = await machineA()
    const remote = new FakeGitHub()
    await sync(files, remote, IDENT)

    remote.goOffline()
    await files.writeText('scenes/one.md', '# One\n\nWritten offline.\n')
    await commitAll(files, 'Offline work', IDENT, { time: 1700000100 })
    expect(await sync(files, remote, IDENT)).toEqual({ kind: 'offline' })

    remote.goOnline()
    expect(await sync(files, remote, IDENT)).toEqual({ kind: 'pushed', commits: 1 })
    expect(await remote.head()).toBe(await head(files))
    expect(await readFileAt(files, (await head(files)) as string, 'scenes/one.md')).toBe('# One\n\nWritten offline.\n')
  })
})
