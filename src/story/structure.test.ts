import { beforeEach, describe, expect, test } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { loadStory, type LoadedStory } from './loadStory'
import { createAct, deleteAct, deleteScene, deleteStoryline, moveAct, moveStoryline, placeScene, renameAct, updateStoryline } from './mutations'

let files: InMemoryFileAccess

async function reload(): Promise<LoadedStory> {
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded
}

function sceneFile(id: string, frontmatter: string, title: string): string {
  return `---\nid: ${id}\n${frontmatter}---\n\n# ${title}\n`
}

beforeEach(async () => {
  files = new InMemoryFileAccess()
  await files.writeText(
    'story.json',
    JSON.stringify({
      title: 'Embers',
      acts: [
        { id: 'act-1', title: 'Act I' },
        { id: 'act-2', title: 'Act II' },
      ],
      storylines: [
        { id: 'heist', name: 'The Heist', color: '#5b6ee1', glyph: '◆', scenes: ['cold-open', 'the-job-offer'] },
        { id: 'mara', name: "Mara's Trust", color: '#d5548e', glyph: '●', scenes: ['the-job-offer', 'cistern'] },
        { id: 'rebellion', name: 'The Rebellion', color: '#2fa08d', glyph: '▲', scenes: [] },
      ],
      settings: {},
    }),
  )
  await files.writeText('scenes/cold-open.md', sceneFile('cold-open', 'storylines: [heist]\nact: act-1\n', 'Cold Open'))
  await files.writeText(
    'scenes/the-job-offer.md',
    sceneFile('the-job-offer', 'storylines: [heist, mara]\nact: act-1\n', 'The Job Offer'),
  )
  await files.writeText('scenes/cistern.md', sceneFile('cistern', 'storylines: [mara]\nact: act-2\n', 'The Dry Cistern'))
  await files.writeText('scenes/loose.md', sceneFile('loose', '', 'Rooftop Duel'))
})

describe('storylines', () => {
  test('a storyline can be renamed and given a new glyph and color; its id and scene order stay', async () => {
    await updateStoryline(files, 'heist', { name: 'The Vault Job', glyph: '★', color: '#123456' })
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.manifest.storylines[0]).toEqual({
      id: 'heist',
      name: 'The Vault Job',
      glyph: '★',
      color: '#123456',
      scenes: ['cold-open', 'the-job-offer'],
    })
  })

  test('a storyline can be moved to another lane position', async () => {
    await moveStoryline(files, 'rebellion', 0)
    const after = await reload()
    expect(after.story.manifest.storylines.map((s) => s.id)).toEqual(['rebellion', 'heist', 'mara'])
  })

  test('deleting a storyline drops it from every member scene; a scene left with none goes loose', async () => {
    await deleteStoryline(files, 'heist')
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.manifest.storylines.map((s) => s.id)).toEqual(['mara', 'rebellion'])
    expect(after.story.scenes.get('cold-open')?.storylines).toEqual([])
    expect(after.story.scenes.get('the-job-offer')?.storylines).toEqual(['mara'])
  })
})

describe('acts', () => {
  test('an act can be renamed; its id stays so scenes keep pointing at it', async () => {
    await renameAct(files, 'act-1', 'Act I — The Spark')
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.manifest.acts[0]).toEqual({ id: 'act-1', title: 'Act I — The Spark' })
    expect(after.story.scenes.get('cold-open')?.act).toBe('act-1')
  })

  test('acts can be reordered', async () => {
    await moveAct(files, 'act-2', 0)
    const after = await reload()
    expect(after.story.manifest.acts.map((a) => a.id)).toEqual(['act-2', 'act-1'])
  })

  test('an empty act can be deleted', async () => {
    await createAct(files, 'Act III')
    await deleteAct(files, 'act-iii')
    const after = await reload()
    expect(after.story.manifest.acts.map((a) => a.id)).toEqual(['act-1', 'act-2'])
  })

  test('an act holding scenes refuses to be deleted, naming the count', async () => {
    await expect(deleteAct(files, 'act-1')).rejects.toThrow('2 scenes')
    const after = await reload()
    expect(after.story.manifest.acts).toHaveLength(2)
  })
})

describe('placing a scene', () => {
  test('joining another storyline threads the scene into its order after the scenes of earlier acts', async () => {
    await placeScene(files, 'cistern', { storylines: ['mara', 'heist'], act: 'act-2' })
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.scenes.get('cistern')?.storylines).toEqual(['mara', 'heist'])
    expect(after.story.manifest.storylines[0].scenes).toEqual(['cold-open', 'the-job-offer', 'cistern'])
    expect(after.story.manifest.storylines[1].scenes).toEqual(['the-job-offer', 'cistern'])
  })

  test('leaving every storyline floats the scene to the pool and drops it from each order', async () => {
    await placeScene(files, 'the-job-offer', { storylines: [], act: 'act-1' })
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.scenes.get('the-job-offer')?.storylines).toEqual([])
    expect(after.story.manifest.storylines[0].scenes).toEqual(['cold-open'])
    expect(after.story.manifest.storylines[1].scenes).toEqual(['cistern'])
  })

  test('a position in one lane puts the scene exactly there', async () => {
    await placeScene(files, 'cistern', { storylines: ['heist'], act: 'act-1', at: { storyline: 'heist', index: 1 } })
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(after.story.scenes.get('cistern')?.act).toBe('act-1')
    expect(after.story.manifest.storylines[0].scenes).toEqual(['cold-open', 'cistern', 'the-job-offer'])
    expect(after.story.manifest.storylines[1].scenes).toEqual(['the-job-offer'])
  })

  test('changing act without a position re-seats the scene where its new act sits in each lane', async () => {
    await placeScene(files, 'cold-open', { storylines: ['heist'], act: 'act-2' })
    const after = await reload()
    expect(after.story.manifest.storylines[0].scenes).toEqual(['the-job-offer', 'cold-open'])
  })

  test('reordering within a lane is a placement with a position', async () => {
    await placeScene(files, 'the-job-offer', {
      storylines: ['heist', 'mara'],
      act: 'act-1',
      at: { storyline: 'heist', index: 0 },
    })
    const after = await reload()
    expect(after.story.manifest.storylines[0].scenes).toEqual(['the-job-offer', 'cold-open'])
    expect(after.story.manifest.storylines[1].scenes).toEqual(['the-job-offer', 'cistern'])
  })
})

describe('deleting a scene', () => {
  test('the file goes and every order drops the slug', async () => {
    await deleteScene(files, 'the-job-offer')
    const after = await reload()
    expect(after.problems).toEqual([])
    expect(await files.exists('scenes/the-job-offer.md')).toBe(false)
    expect(after.story.scenes.has('the-job-offer')).toBe(false)
    expect(after.story.manifest.storylines[0].scenes).toEqual(['cold-open'])
    expect(after.story.manifest.storylines[1].scenes).toEqual(['cistern'])
  })

  test('a choice that pointed at the deleted scene is flagged, not cut', async () => {
    await files.writeText(
      'scenes/cold-open.md',
      sceneFile('cold-open', 'storylines: [heist]\nact: act-1\nchoices:\n  - label: Take the job\n    to: the-job-offer\n', 'Cold Open'),
    )
    await deleteScene(files, 'the-job-offer')
    const after = await reload()
    expect(after.problems).toEqual([
      expect.objectContaining({
        path: 'scenes/cold-open.md',
        message: expect.stringMatching(/choice .*Take the job.*the-job-offer.*doesn.t exist/i),
      }),
    ])
    expect(after.story.scenes.get('cold-open')?.choices).toEqual([{ label: 'Take the job', to: 'the-job-offer', effects: [] }])
  })
})
