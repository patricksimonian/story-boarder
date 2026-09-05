import { describe, expect, test } from 'vitest'
import type { Scene } from '../domain/types'
import { insertBeat, moveBeat, removeBeat, setBeat } from './beats'

/**
 * Beats have no identity on disk — position is identity — while effects
 * cite beats by 1-based number. Every edit that shifts positions has to
 * carry the anchors along, so a citation keeps pointing at the same beat.
 */
const scene: Scene = {
  id: 'crossfire',
  title: 'Crossfire at the Tide-Gate',
  storylines: ['mara'],
  tags: [],
  characters: [],
  images: [],
  effects: [
    { source: 'gate_open = true', anchor: 3 },
    { source: 'trust += 1', anchor: 1 },
    { source: 'alarm = true' },
  ],
  choices: [{ label: 'Run', to: 'the-uprising', effects: [{ source: 'seen = true', anchor: 2 }] }],
  synopsis: '',
  beats: ['Two plans, one gate.', 'Mara opens the gate.', 'The alarm sounds.'],
  prose: '',
}

const anchors = (s: Scene) => [
  ...s.effects.map((e) => e.anchor),
  ...s.choices.flatMap((c) => c.effects.map((e) => e.anchor)),
]

describe('editing beats keeps effect anchors on the same beat', () => {
  test('inserting a beat above shifts later anchors down', () => {
    const next = insertBeat(scene, 1, 'Rook hesitates.')
    expect(next.beats).toEqual(['Two plans, one gate.', 'Rook hesitates.', 'Mara opens the gate.', 'The alarm sounds.'])
    expect(anchors(next)).toEqual([4, 1, undefined, 3])
  })

  test('removing a beat drops its anchors but keeps the effects', () => {
    const next = removeBeat(scene, 1)
    expect(next.beats).toEqual(['Two plans, one gate.', 'The alarm sounds.'])
    expect(next.effects.map((e) => e.source)).toEqual(['gate_open = true', 'trust += 1', 'alarm = true'])
    expect(anchors(next)).toEqual([2, 1, undefined, undefined])
  })

  test('moving a beat carries its anchor with it', () => {
    const next = moveBeat(scene, 2, 0)
    expect(next.beats).toEqual(['The alarm sounds.', 'Two plans, one gate.', 'Mara opens the gate.'])
    expect(anchors(next)).toEqual([1, 2, undefined, 3])
  })

  test('moving a beat later in the list', () => {
    const next = moveBeat(scene, 0, 2)
    expect(next.beats).toEqual(['Mara opens the gate.', 'The alarm sounds.', 'Two plans, one gate.'])
    expect(anchors(next)).toEqual([2, 3, undefined, 1])
  })

  test('a move that goes nowhere changes nothing', () => {
    expect(moveBeat(scene, 1, 1)).toEqual(scene)
    expect(moveBeat(scene, 0, -1)).toEqual(scene)
    expect(moveBeat(scene, 2, 3)).toEqual(scene)
  })

  test('retyping a beat leaves anchors alone', () => {
    const next = setBeat(scene, 1, 'Mara opens the gate, slowly.')
    expect(next.beats[1]).toBe('Mara opens the gate, slowly.')
    expect(anchors(next)).toEqual(anchors(scene))
  })

  test('the original scene is never mutated', () => {
    insertBeat(scene, 0, 'x')
    removeBeat(scene, 0)
    moveBeat(scene, 0, 2)
    setBeat(scene, 0, 'y')
    expect(scene.beats).toEqual(['Two plans, one gate.', 'Mara opens the gate.', 'The alarm sounds.'])
    expect(anchors(scene)).toEqual([3, 1, undefined, 2])
  })
})
