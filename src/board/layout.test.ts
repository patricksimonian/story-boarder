import { describe, expect, test } from 'vitest'
import type { Scene, Slug, StoryManifest } from '../domain/types'
import { layoutBoard, sceneAct } from './layout'

function scene(id: Slug, storylines: Slug[], act?: Slug): Scene {
  return {
    id,
    title: id,
    storylines,
    act,
    tags: [],
    characters: [],
    effects: [],
    choices: [],
    synopsis: '',
    beats: [],
    prose: '',
    images: [],
  }
}

function manifest(acts: Slug[], lanes: Record<Slug, Slug[]>): StoryManifest {
  return {
    title: 'T',
    acts: acts.map((id) => ({ id, title: id })),
    storylines: Object.entries(lanes).map(([id, scenes]) => ({ id, name: id, color: '#000', glyph: '●', scenes })),
    settings: {},
  }
}

const byId = (...list: Scene[]) => new Map(list.map((s) => [s.id, s]))

describe('layoutBoard', () => {
  test('a lane scene with no act gets a leading column in a range with no act', () => {
    const m = manifest(['act-1'], { heist: ['idea', 'opening'] })
    const layout = layoutBoard(m, byId(scene('idea', ['heist']), scene('opening', ['heist'], 'act-1')))
    expect(layout.columns.get('idea')).toBe(0)
    expect(layout.columns.get('opening')).toBe(1)
    expect(layout.actOf.has('idea')).toBe(false)
    expect(layout.actRanges.map((r) => [r.act?.id ?? null, r.start, r.end])).toEqual([
      [null, 0, 0],
      ['act-1', 1, 1],
    ])
    expect(layout.columnCount).toBe(2)
  })

  test('a scene naming an act the manifest does not declare lands in the same range', () => {
    const m = manifest(['act-1'], { heist: ['ghost', 'opening'] })
    const layout = layoutBoard(m, byId(scene('ghost', ['heist'], 'act-9'), scene('opening', ['heist'], 'act-1')))
    expect(layout.columns.get('ghost')).toBe(0)
    expect(layout.actRanges[0].act).toBeNull()
  })

  test('no range without an act appears when every lane scene has one', () => {
    const m = manifest(['act-1'], { heist: ['opening'] })
    const layout = layoutBoard(m, byId(scene('opening', ['heist'], 'act-1')))
    expect(layout.actRanges.map((r) => r.act?.id)).toEqual(['act-1'])
    expect(layout.columnCount).toBe(1)
  })

  test('a story with lanes but no acts still lays out its scenes', () => {
    const m = manifest([], { heist: ['a', 'b'] })
    const layout = layoutBoard(m, byId(scene('a', ['heist']), scene('b', ['heist'])))
    expect([...layout.columns.entries()]).toEqual([
      ['a', 0],
      ['b', 1],
    ])
    expect(layout.actRanges).toEqual([{ act: null, start: 0, end: 1 }])
  })

  test('sceneAct answers only with a declared act', () => {
    const m = manifest(['act-1'], {})
    expect(sceneAct(scene('x', [], 'act-1'), m)).toBe('act-1')
    expect(sceneAct(scene('x', [], 'act-9'), m)).toBeNull()
    expect(sceneAct(scene('x', []), m)).toBeNull()
  })
})
