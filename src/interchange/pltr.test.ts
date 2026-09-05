import { describe, expect, it } from 'vitest'
import { parseReferenceFile } from '../files/referenceFile'
import { parseSceneFile } from '../files/sceneFile'
import { pltrToStoryFiles } from './pltr'

/**
 * A .pltr file is one JSON document — a serialized Redux store. The
 * importer branches on file.version, walks the post-2021.4.13 beats
 * tree (or the older flat array), reads Slate rich text, and treats
 * "auto" beat titles as the auto-numbering sentinel they are. Plottr
 * has no branching or variables, so an import seeds structure, prose,
 * and reference entities — the engine is authored here afterward.
 */

const PLTR = JSON.stringify({
  file: { fileName: 'Embers.pltr', loaded: true, dirty: false, version: '2021.6.9' },
  ui: { currentView: 'timeline' },
  series: { name: 'Embers', premise: '', genre: '', theme: '', templates: [] },
  books: { allIds: [1], 1: { id: 1, title: 'Embers of the Vault', premise: '', imageId: null } },
  beats: {
    series: { children: { null: [] }, heap: {}, index: {} },
    1: {
      children: { null: [7, 8] },
      heap: { 7: null, 8: null },
      index: {
        7: { id: 7, bookId: 1, position: 0, title: 'auto', time: 0, expanded: true },
        8: { id: 8, bookId: 1, position: 1, title: 'The Descent', time: 0, expanded: true },
      },
    },
  },
  lines: [
    { id: 1, bookId: 1, color: '#6cace4', title: 'Main Plot', position: 0 },
    { id: 2, bookId: 1, color: '#d5548e', title: 'Mara', position: 1 },
  ],
  cards: [
    {
      id: 1,
      lineId: 1,
      beatId: 7,
      bookId: null,
      positionWithinLine: 0,
      positionInBeat: 0,
      title: 'Cold Open',
      description: [
        { type: 'paragraph', children: [{ text: 'A grain lift ' }, { text: 'goes sideways.', bold: true }] },
        { type: 'paragraph', children: [{ text: 'Nobody claps.' }] },
      ],
      tags: [1],
      characters: [1],
      places: [],
    },
    {
      id: 2,
      lineId: 2,
      beatId: 7,
      positionWithinLine: 0,
      positionInBeat: 1,
      title: 'The Door-Woman',
      description: [{ type: 'paragraph', children: [{ text: 'Mara talks first.' }] }],
      tags: [],
      characters: [1],
      places: [1],
    },
    {
      id: 3,
      lineId: 1,
      beatId: 8,
      positionWithinLine: 1,
      positionInBeat: 0,
      title: 'The Vault',
      description: 'Plain string from an old file.',
      tags: [],
      characters: [],
      places: [],
    },
  ],
  characters: [
    {
      id: 1,
      name: 'Mara',
      description: 'The door-woman.',
      notes: [{ type: 'paragraph', children: [{ text: 'Keeps every key.' }] }],
      tags: [],
      categoryId: null,
    },
  ],
  places: [{ id: 1, name: 'The Underhive', description: 'Below the fullers.', notes: [], tags: [] }],
  tags: [{ id: 1, title: 'heist', color: null }],
  notes: [],
  images: {},
  hierarchyLevels: {},
})

describe('guards', () => {
  it('rejects what is not JSON, readably', () => {
    const result = pltrToStoryFiles('not json at all')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/JSON/i)
  })

  it('rejects the v1 era by version, readably', () => {
    const result = pltrToStoryFiles(JSON.stringify({ file: { version: '1.3' }, storyName: 'Old' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('1.3')
  })
})

describe('the 2021-era beats tree', () => {
  it('maps book → story, beats → acts (auto-numbered), lines → storylines, cards → scenes in order', () => {
    const result = pltrToStoryFiles(PLTR)
    if (!result.ok) throw new Error(result.reason)
    const manifest = JSON.parse(result.files['story.json']) as {
      title: string
      acts: { id: string; title: string }[]
      storylines: { id: string; name: string; color: string; scenes: string[] }[]
    }
    expect(manifest.title).toBe('Embers of the Vault')
    expect(manifest.acts.map((a) => a.title)).toEqual(['Chapter 1', 'The Descent'])
    expect(manifest.storylines.map((s) => s.name)).toEqual(['Main Plot', 'Mara'])
    expect(manifest.storylines[0].color).toBe('#6cace4')
    expect(manifest.storylines[0].scenes).toEqual(['cold-open', 'the-vault'])
    expect(manifest.storylines[1].scenes).toEqual(['the-door-woman'])
  })

  it('writes scenes with act, tags, characters, and Slate prose as Markdown', () => {
    const result = pltrToStoryFiles(PLTR)
    if (!result.ok) throw new Error(result.reason)
    const parsed = parseSceneFile('cold-open', result.files['scenes/cold-open.md'])
    if (!parsed.ok) throw new Error(parsed.problems.join('; '))
    expect(parsed.scene.title).toBe('Cold Open')
    expect(parsed.scene.act).toBe('chapter-1')
    expect(parsed.scene.storylines).toEqual(['main-plot'])
    expect(parsed.scene.tags).toEqual(['heist'])
    expect(parsed.scene.characters).toEqual(['mara'])
    expect(parsed.scene.prose).toBe('A grain lift **goes sideways.**\n\nNobody claps.')
  })

  it('accepts a plain-string description as one paragraph', () => {
    const result = pltrToStoryFiles(PLTR)
    if (!result.ok) throw new Error(result.reason)
    const parsed = parseSceneFile('the-vault', result.files['scenes/the-vault.md'])
    if (!parsed.ok) throw new Error(parsed.problems.join('; '))
    expect(parsed.scene.prose).toBe('Plain string from an old file.')
    expect(parsed.scene.act).toBe('the-descent')
  })

  it('writes characters and places as reference entities', () => {
    const result = pltrToStoryFiles(PLTR)
    if (!result.ok) throw new Error(result.reason)

    const mara = parseReferenceFile('character', 'mara', result.files['characters/mara.md'])
    if (!mara.ok) throw new Error(mara.problems.join('; '))
    expect(mara.entity.title).toBe('Mara')
    expect(mara.entity.body).toContain('The door-woman.')
    expect(mara.entity.body).toContain('Keeps every key.')

    const underhive = parseReferenceFile('place', 'the-underhive', result.files['places/the-underhive.md'])
    if (!underhive.ok) throw new Error(underhive.problems.join('; '))
    expect(underhive.entity.title).toBe('The Underhive')
  })
})

describe('the 2020-era flat beats', () => {
  it('imports a flat beats array the same way', () => {
    const flat = JSON.stringify({
      file: { version: '2020.8.28' },
      books: { allIds: [1], 1: { id: 1, title: 'Older Story' } },
      beats: [
        { id: 7, bookId: 1, position: 0, title: 'Opening' },
        { id: 8, bookId: 1, position: 1, title: 'auto' },
      ],
      lines: [{ id: 1, bookId: 1, color: '#6cace4', title: 'Plot', position: 0 }],
      cards: [
        {
          id: 1,
          lineId: 1,
          beatId: 8,
          positionWithinLine: 0,
          positionInBeat: 0,
          title: 'Late Scene',
          description: [{ type: 'paragraph', children: [{ text: 'Almost done.' }] }],
          tags: [],
          characters: [],
          places: [],
        },
      ],
      characters: [],
      places: [],
      tags: [],
    })
    const result = pltrToStoryFiles(flat)
    if (!result.ok) throw new Error(result.reason)
    const manifest = JSON.parse(result.files['story.json']) as { acts: { title: string }[]; title: string }
    expect(manifest.title).toBe('Older Story')
    expect(manifest.acts.map((a) => a.title)).toEqual(['Opening', 'Chapter 2'])
    const parsed = parseSceneFile('late-scene', result.files['scenes/late-scene.md'])
    if (!parsed.ok) throw new Error(parsed.problems.join('; '))
    expect(parsed.scene.act).toBe('chapter-2')
  })
})
