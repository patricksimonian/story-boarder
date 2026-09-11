import { describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { folderGit } from './client'

/**
 * The GitClient the app holds: boundary commits with generated messages,
 * checkpoints in the writer's own words, the log, and reads from
 * history — all over one story folder's FileAccess.
 */

const IDENT = { name: 'Test Author', email: 'test@example.com' }

const SCENE = `---
id: rooftop-duel
---

# Rooftop Duel

## Synopsis

Tiles and fog.

## Prose

No witnesses except everyone.
`

async function storyFolder(): Promise<InMemoryFileAccess> {
  const files = new InMemoryFileAccess()
  await files.writeText('story.json', JSON.stringify({ title: 'Interop', acts: [], storylines: [], settings: {} }))
  await files.writeText('scenes/rooftop-duel.md', SCENE)
  return files
}

describe('boundary commits', () => {
  it('sweeps the folder with a generated message, declining when clean', async () => {
    const files = await storyFolder()
    const git = folderGit(files, IDENT)

    const first = await git.commitBoundary()
    expect(first).not.toBeNull()
    expect(await git.commitBoundary()).toBeNull()

    const commits = await git.log()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ id: first, message: 'New story: Interop; New scene: Rooftop Duel', author: 'Test Author' })
  })

  it('describes the edit it commits', async () => {
    const files = await storyFolder()
    const git = folderGit(files, IDENT)
    await git.commitBoundary()

    await files.writeText('scenes/rooftop-duel.md', SCENE.replace('No witnesses except everyone.', 'No witnesses except everyone, and the fog keeps notes.'))
    await git.commitBoundary()

    const commits = await git.log()
    expect(commits).toHaveLength(2)
    expect(commits[0].message).toBe('Edit scene: Rooftop Duel — prose +5 words')
  })

  it('describes the snapshot it took, not the folder as it stands once the walk is over', async () => {
    // The app keeps saving while a boundary walks the folder. The message
    // used to come from a second read of the folder, so it could name a
    // file the commit never held; now message and tree come from one walk.
    const files = await storyFolder()
    const git = folderGit(files, IDENT)
    await git.commitBoundary()

    const scene = 'scenes/rooftop-duel.md'
    const five = SCENE.replace('No witnesses except everyone.', 'No witnesses except everyone, and the fog keeps notes.')
    const ten = SCENE.replace('No witnesses except everyone.', 'No witnesses except everyone, and the fog keeps notes on every one of them.')
    await files.writeText(scene, five)
    // The walk reads the scene once; right after, the writer's next save lands.
    const read = files.readBinary.bind(files)
    let seen = 0
    files.readBinary = async (path) => {
      const bytes = await read(path)
      if (path === scene && seen++ === 0) await files.writeText(scene, ten)
      return bytes
    }

    const sha = (await git.commitBoundary()) as string
    expect((await git.log())[0].message).toBe('Edit scene: Rooftop Duel — prose +5 words')
    expect(await git.readFileAt(sha, scene)).toBe(five)
    // The later save is not lost: the next boundary picks it up.
    files.readBinary = read
    const next = (await git.commitBoundary()) as string
    expect((await git.log())[0].message).toBe('Edit scene: Rooftop Duel — prose +5 words')
    expect(await git.readFileAt(next, scene)).toBe(ten)
  })
})

describe('checkpoints', () => {
  it('keeps the writer’s own words, declining when clean', async () => {
    const files = await storyFolder()
    const git = folderGit(files, IDENT)
    await git.commitBoundary()

    expect(await git.checkpoint('Before I try something reckless')).toBeNull()

    await files.writeText('scenes/rooftop-duel.md', SCENE.replace('Tiles and fog.', 'Tiles, fog, a blade.'))
    const sha = await git.checkpoint('Before I try something reckless')
    expect(sha).not.toBeNull()
    expect((await git.log())[0].message).toBe('Before I try something reckless')
  })
})

describe('history', () => {
  it('filters the log by path and reads a file as it was', async () => {
    const files = await storyFolder()
    const git = folderGit(files, IDENT)
    const first = await git.commitBoundary()

    await files.writeText('scenes/rooftop-duel.md', SCENE.replace('Tiles and fog.', 'Tiles, fog, a blade.'))
    await git.commitBoundary()
    await files.writeText('story.json', JSON.stringify({ title: 'Interop II', acts: [], storylines: [], settings: {} }))
    await git.commitBoundary()

    const sceneCommits = await git.log({ path: 'scenes/rooftop-duel.md' })
    expect(sceneCommits.map((c) => c.message)).toEqual([
      'Edit scene: Rooftop Duel — synopsis edited',
      'New story: Interop; New scene: Rooftop Duel',
    ])
    expect(await git.readFileAt(first as string, 'scenes/rooftop-duel.md')).toBe(SCENE)
  })
})
