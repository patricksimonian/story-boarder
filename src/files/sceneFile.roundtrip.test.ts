import { describe, expect, test } from 'vitest'
import type { Scene } from '../domain/types'
import { parseSceneFile, serializeSceneFile } from './sceneFile'

const FULL: Scene = {
  id: 'crossfire-at-the-gate',
  title: 'Crossfire at the Tide-Gate',
  storylines: ['mara', 'rebellion'],
  act: 'act-2',
  tags: ['set-piece', 'collision'],
  characters: ['rook', 'mara', 'sera'],
  condition: 'rebellion_strength >= 2',
  effects: [{ source: 'rebellion_strength += 1', anchor: 3 }],
  choices: [
    {
      label: 'Open the gate',
      to: 'the-uprising',
      condition: 'trust >= 2',
      effects: [{ source: 'gate_open = true' }],
      chance: 60,
    },
  ],
  chance: 30,
  images: ['assets/tide-gate.png'],
  synopsis: "Sera's raid collides with the crew's route.",
  beats: ['Two plans, one gate, zero coordination.', 'Mara opens the gate.'],
  prose: 'The gate had one keeper too many.\n\nAnd one plan too few.',
}

const BARE: Scene = {
  id: 'rooftop-duel',
  title: 'Rooftop Duel',
  storylines: [],
  tags: [],
  characters: [],
  effects: [],
  choices: [],
  images: [],
  synopsis: '',
  beats: [],
  prose: '',
}

describe('serializeSceneFile', () => {
  test('a full scene survives the round trip', () => {
    const result = parseSceneFile(FULL.id, serializeSceneFile(FULL))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.scene).toEqual(FULL)
  })

  test('a bare pool scene survives the round trip', () => {
    const result = parseSceneFile(BARE.id, serializeSceneFile(BARE))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.scene).toEqual(BARE)
  })

  test('empty fields stay out of the frontmatter', () => {
    const text = serializeSceneFile(BARE)
    expect(text).not.toMatch(/tags:|characters:|condition:|effects:|choices:|chance:|act:/)
    expect(text).toContain('## Synopsis')
    expect(text).toContain('## Beats')
    expect(text).toContain('## Prose')
  })
})

describe('frontmatter the app does not know about', () => {
  test('a hand-added field survives being opened and saved', () => {
    const text = `---\nid: cistern\nmood: tense\nstorylines: [mara]\ndraft_of: 2\n---\n\n# The Dry Cistern\n`
    const result = parseSceneFile('cistern', text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const saved = serializeSceneFile(result.scene)
    expect(saved).toContain('mood: tense')
    expect(saved).toContain('draft_of: 2')
    const again = parseSceneFile('cistern', saved)
    expect(again.ok && again.scene).toEqual(result.scene)
  })
})
