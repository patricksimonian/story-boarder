import { beforeEach, describe, expect, test } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { loadStory, type LoadedStory } from './loadStory'
import { createAct, createReference, createScene, createStoryline, deleteReference, setWordGoal, slugify, storeAsset } from './mutations'

let files: InMemoryFileAccess

async function reload(): Promise<LoadedStory> {
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded
}

beforeEach(async () => {
  files = new InMemoryFileAccess()
  await files.writeText(
    'story.json',
    JSON.stringify({
      title: 'Embers',
      acts: [{ id: 'act-1', title: 'Act I' }],
      storylines: [
        { id: 'main', name: 'The Heist', color: '#5b6ee1', glyph: '◆', scenes: [] },
        { id: 'mara', name: "Mara's Trust", color: '#d5548e', glyph: '●', scenes: [] },
      ],
      settings: {},
    }),
  )
})

describe('slugify', () => {
  test('turns a title into a stable slug', () => {
    expect(slugify('The Dry Cistern!', () => false)).toBe('the-dry-cistern')
  })

  test('dodges collisions with a numeric suffix', () => {
    expect(slugify('Embers', (s) => s === 'embers')).toBe('embers-2')
  })
})

describe('createReference and deleteReference', () => {
  test('each kind lands in its own folder and loads back', async () => {
    expect(await createReference(files, 'character', 'Mara')).toBe('mara')
    expect(await createReference(files, 'place', 'The Vault')).toBe('the-vault')
    expect(await createReference(files, 'lore', "The Warden's Eye")).toBe('the-warden-s-eye')

    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.references.get('mara')).toMatchObject({ kind: 'character', title: 'Mara', tags: [], body: '' })
    expect(after.story.references.get('the-vault')?.kind).toBe('place')
    expect(after.story.references.get('the-warden-s-eye')?.kind).toBe('lore')
    expect(await files.exists('characters/mara.md')).toBe(true)
    expect(await files.exists('places/the-vault.md')).toBe(true)
    expect(await files.exists('lore/the-warden-s-eye.md')).toBe(true)
  })

  test('slugs dodge collisions within their kind', async () => {
    await createReference(files, 'character', 'Mara')
    expect(await createReference(files, 'character', 'Mara')).toBe('mara-2')
  })

  test('deleting removes the file; a scene citing it keeps the citation as written', async () => {
    await createReference(files, 'character', 'Mara')
    await createScene(files, { title: 'The Job Offer', act: 'act-1', storylines: ['main'] })
    await files.writeText(
      'scenes/the-job-offer.md',
      '---\nid: the-job-offer\nstorylines: [main]\nact: act-1\ncharacters: [mara]\n---\n\n# The Job Offer\n',
    )

    await deleteReference(files, 'character', 'mara')
    const after = await reload()
    expect(await files.exists('characters/mara.md')).toBe(false)
    expect(after.story.references.has('mara')).toBe(false)
    expect(after.story.scenes.get('the-job-offer')?.characters).toEqual(['mara'])
  })
})

describe('setWordGoal', () => {
  test('a goal lands in settings and clears cleanly', async () => {
    await setWordGoal(files, 50000)
    let manifest = JSON.parse(await files.readText('story.json'))
    expect(manifest.settings.goals).toEqual({ storyWords: 50000 })

    await setWordGoal(files, undefined)
    manifest = JSON.parse(await files.readText('story.json'))
    expect(manifest.settings.goals).toBeUndefined()
  })
})

describe('storeAsset', () => {
  test('lands the bytes under assets/ with a slugged name and the extension kept', async () => {
    const path = await storeAsset(files, 'Rook Sketch (final).PNG', new Uint8Array([1, 2, 3]))
    expect(path).toBe('assets/rook-sketch-final.png')
    expect(await files.readBinary(path)).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('a second file of the same name dodges the collision', async () => {
    await storeAsset(files, 'sketch.png', new Uint8Array([1]))
    const second = await storeAsset(files, 'sketch.png', new Uint8Array([2]))
    expect(second).toBe('assets/sketch-2.png')
    expect(await files.readBinary('assets/sketch.png')).toEqual(new Uint8Array([1]))
  })
})

describe('createScene', () => {
  test('writes the file and threads it into every member storyline', async () => {
    const slug = await createScene(files, {
      title: 'The Job Offer',
      act: 'act-1',
      storylines: ['main', 'mara'],
    })
    expect(slug).toBe('the-job-offer')

    const after = await reload()
    expect(after.problems).toEqual([])
    const scene = after.story.scenes.get('the-job-offer')
    expect(scene?.title).toBe('The Job Offer')
    expect(scene?.storylines).toEqual(['main', 'mara'])
    expect(after.story.manifest.storylines[0].scenes).toContain('the-job-offer')
    expect(after.story.manifest.storylines[1].scenes).toContain('the-job-offer')
  })

  test('a scene with no storylines lands in the idea pool', async () => {
    await createScene(files, { title: 'Rooftop Duel', storylines: [] })
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.scenes.get('rooftop-duel')?.storylines).toEqual([])
    expect(after.story.manifest.storylines.every((s) => !s.scenes.includes('rooftop-duel'))).toBe(true)
  })
})

describe('createAct and createStoryline', () => {
  test('append to the manifest and survive reload', async () => {
    await createAct(files, 'Act II — The Descent')
    await createStoryline(files, {
      name: 'The Rebellion',
      color: '#2fa08d',
      glyph: '▲',
    })
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.manifest.acts.map((a) => a.id)).toEqual(['act-1', 'act-ii-the-descent'])
    const rebellion = after.story.manifest.storylines[2]
    expect(rebellion).toMatchObject({ id: 'the-rebellion', glyph: '▲', scenes: [] })
  })
})
