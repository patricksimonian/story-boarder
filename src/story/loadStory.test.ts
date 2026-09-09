import { beforeEach, describe, expect, test } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { loadStory } from './loadStory'

let files: InMemoryFileAccess

const MANIFEST = JSON.stringify({
  title: 'Embers of the Vault',
  acts: [
    { id: 'act-1', title: 'Act I — The Spark' },
    { id: 'act-2', title: 'Act II — The Descent' },
  ],
  storylines: [
    { id: 'main', name: 'The Heist', color: '#5b6ee1', glyph: '◆', scenes: ['cold-open', 'the-job-offer', 'ghost-scene'] },
    { id: 'mara', name: "Mara's Trust", color: '#d5548e', glyph: '●', scenes: ['the-job-offer'] },
  ],
  settings: {},
})

function scene(id: string, extra: string, title: string): string {
  return `---\nid: ${id}\n${extra}---\n\n# ${title}\n\n## Synopsis\n\nSomething happens.\n`
}

beforeEach(async () => {
  files = new InMemoryFileAccess()
  await files.writeText('story.json', MANIFEST)
  await files.writeText('scenes/cold-open.md', scene('cold-open', 'storylines: [main]\nact: act-1\n', 'Cold Open'))
  await files.writeText('scenes/the-job-offer.md', scene('the-job-offer', 'storylines: [main, mara]\nact: act-1\n', 'The Job Offer'))
  await files.writeText('scenes/rooftop-duel.md', scene('rooftop-duel', '', 'Rooftop Duel'))
  await files.writeText('scenes/broken.md', 'no frontmatter at all')
  await files.writeText('characters/mara.md', '---\nid: mara\n---\n\n# Mara\n\nThe door-woman.\n')
  await files.writeText('variables.json', JSON.stringify({ variables: [{ id: 'trust', type: 'number', initial: 0 }] }))
})

describe('loadStory', () => {
  test('a folder without story.json is not a story folder', async () => {
    const result = await loadStory(new InMemoryFileAccess())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/story\.json/)
  })

  test('loads scenes, references, and the registry', async () => {
    const result = await loadStory(files)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { story } = result.loaded
    expect(story.manifest.title).toBe('Embers of the Vault')
    expect([...story.scenes.keys()].sort()).toEqual(['cold-open', 'rooftop-duel', 'the-job-offer'])
    expect(story.scenes.get('the-job-offer')?.storylines).toEqual(['main', 'mara'])
    expect(story.references.get('mara')?.kind).toBe('character')
    expect(story.registry.variables[0].id).toBe('trust')
  })

  test('flags the malformed scene with its raw text, and keeps the rest', async () => {
    const result = await loadStory(files)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const broken = result.loaded.problems.find((p) => p.path === 'scenes/broken.md')
    expect(broken).toBeDefined()
    expect(broken?.raw).toBe('no frontmatter at all')
    expect(result.loaded.story.scenes.has('broken')).toBe(false)
  })

  test('flags a manifest scene id that has no file', async () => {
    const result = await loadStory(files)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const dangling = result.loaded.problems.find((p) => p.message.includes('ghost-scene'))
    expect(dangling?.path).toBe('story.json')
  })

  test('a broken story.json still opens, flagged and raw-editable', async () => {
    await files.writeText('story.json', '{ not json')
    const result = await loadStory(files)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.loaded.story.manifest.storylines).toEqual([])
    const flagged = result.loaded.problems.find((p) => p.path === 'story.json')
    expect(flagged?.raw).toBe('{ not json')
  })

  test('mentions.json is read as verdicts; a broken one is flagged and the story still opens', async () => {
    await files.writeText('mentions.json', '{"scene:cold-open": [{"quote": "Rook", "entity": null}]}')
    const result = await loadStory(files)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.loaded.story.verdicts).toEqual({ 'scene:cold-open': [{ quote: 'Rook', entity: null, by: 'writer' }] })

    await files.writeText('mentions.json', '[1]')
    const again = await loadStory(files)
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.loaded.story.verdicts).toEqual({})
    expect(again.loaded.problems.find((p) => p.path === 'mentions.json')?.raw).toBe('[1]')
  })
})
