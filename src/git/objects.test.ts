import { describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
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
 * Every expected sha here came from real git (2.45.2), run once against
 * a scratch repo with pinned author, email, and dates — the independent
 * truth these encoders are held to. Same bytes, same sha, or git itself
 * couldn't read what we write.
 */

const text = (s: string) => new TextEncoder().encode(s)

const ident = (time: number) => ({ name: 'Test Author', email: 'test@example.com', time, tz: '+0000' })

describe('hashObject', () => {
  it('hashes a blob the way git does', async () => {
    expect(await hashObject('blob', text('hello world\n'))).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad')
    expect(await hashObject('blob', text('# The Dry Cistern\n'))).toBe('fc7cfb611af859731605dc175d8f48b106bb34fd')
  })
})

describe('trees', () => {
  const cistern: TreeEntry = { mode: '100644', name: 'cistern.md', sha: 'fc7cfb611af859731605dc175d8f48b106bb34fd' }

  it('encodes a one-file tree to the sha git computed', async () => {
    expect(await hashObject('tree', encodeTree([cistern]))).toBe('5d2f8649db6f37b08f89bfa2796b6870a9f9106b')
  })

  it('sorts entries itself — handed backwards, same sha', async () => {
    const scenes: TreeEntry = { mode: '40000', name: 'scenes', sha: '5d2f8649db6f37b08f89bfa2796b6870a9f9106b' }
    const hello: TreeEntry = { mode: '100644', name: 'hello.txt', sha: '3b18e512dba79e4c8300dd08aeb37f8e728b8dad' }
    expect(await hashObject('tree', encodeTree([scenes, hello]))).toBe('837cb7bdc59a4150b78d160edbaa3332ff47d3f3')
  })

  it('sorts a directory as if its name ended in a slash', async () => {
    // Directories compare as name + '/', so foo.txt ('.' is 0x2e) sorts
    // before the directory foo ('/' is 0x2f). Real git ordered this tree
    // foo.txt, foo, hello.txt, scenes and hashed it to:
    const entries: TreeEntry[] = [
      { mode: '40000', name: 'foo', sha: 'ca9bd59581a229f78d8b51a00dd2839d049d475f' },
      { mode: '40000', name: 'scenes', sha: '5d2f8649db6f37b08f89bfa2796b6870a9f9106b' },
      { mode: '100644', name: 'hello.txt', sha: 'c90c5155ccd6661aed956510f5bd57828eec9ddb' },
      { mode: '100644', name: 'foo.txt', sha: 'b9bca019c83a65e6d717d0b6da86215f45dde1b3' },
    ]
    expect(await hashObject('tree', encodeTree(entries))).toBe('ab24542f3afa163d18b9a66057d76309661edbe0')
  })

  it('decodes what it encodes, sorted', () => {
    const entries: TreeEntry[] = [
      { mode: '40000', name: 'scenes', sha: '5d2f8649db6f37b08f89bfa2796b6870a9f9106b' },
      { mode: '100644', name: 'hello.txt', sha: '3b18e512dba79e4c8300dd08aeb37f8e728b8dad' },
    ]
    expect(decodeTree(encodeTree(entries))).toEqual([entries[1], entries[0]])
  })
})

describe('commits', () => {
  it('encodes a parentless commit to the sha git computed', async () => {
    const commit: CommitObject = {
      tree: '837cb7bdc59a4150b78d160edbaa3332ff47d3f3',
      parents: [],
      author: ident(1700000000),
      committer: ident(1700000000),
      message: 'First commit',
    }
    expect(await hashObject('commit', encodeCommit(commit))).toBe('84f0628539f6de1ce069e169162fcf084eba7dbb')
  })

  it('encodes a child commit to the sha git computed', async () => {
    const commit: CommitObject = {
      tree: '22d8906ac67d2c7434ff5d5f0206a6d3214c932c',
      parents: ['84f0628539f6de1ce069e169162fcf084eba7dbb'],
      author: ident(1700000100),
      committer: ident(1700000100),
      message: 'Edit hello',
    }
    expect(await hashObject('commit', encodeCommit(commit))).toBe('d774dc36c9f0e9726f0dcb4ef81d9e44edb29c6d')
  })

  it('decodes what it encodes', () => {
    const commit: CommitObject = {
      tree: '22d8906ac67d2c7434ff5d5f0206a6d3214c932c',
      parents: ['84f0628539f6de1ce069e169162fcf084eba7dbb'],
      author: ident(1700000100),
      committer: { name: 'Someone Else', email: 'else@example.com', time: 1700000200, tz: '-0500' },
      message: 'Edit hello\n\nWith a body paragraph.',
    }
    expect(decodeCommit(encodeCommit(commit))).toEqual(commit)
  })
})

describe('the object store', () => {
  it('writes a deflated loose object under .git/objects and reads it back', async () => {
    const files = new InMemoryFileAccess()
    const sha = await writeObject(files, 'blob', text('hello world\n'))
    expect(sha).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad')
    expect(await files.exists('.git/objects/3b/18e512dba79e4c8300dd08aeb37f8e728b8dad')).toBe(true)

    const back = await readObject(files, sha)
    expect(back.type).toBe('blob')
    expect(new TextDecoder().decode(back.body)).toBe('hello world\n')
  })

  it('round-trips a tree and a commit through the store', async () => {
    const files = new InMemoryFileAccess()
    const tree = encodeTree([{ mode: '100644', name: 'cistern.md', sha: 'fc7cfb611af859731605dc175d8f48b106bb34fd' }])
    const treeSha = await writeObject(files, 'tree', tree)
    expect(treeSha).toBe('5d2f8649db6f37b08f89bfa2796b6870a9f9106b')
    expect((await readObject(files, treeSha)).body).toEqual(tree)

    const commit = encodeCommit({
      tree: treeSha,
      parents: [],
      author: ident(1700000000),
      committer: ident(1700000000),
      message: 'First commit',
    })
    const commitSha = await writeObject(files, 'commit', commit)
    const back = await readObject(files, commitSha)
    expect(back.type).toBe('commit')
    // Decoded, not toEqual on the arrays: jsdom's TextEncoder makes its
    // Uint8Arrays in another realm, and vitest minds the prototype.
    expect(new TextDecoder().decode(back.body)).toBe(new TextDecoder().decode(commit))
  })
})
