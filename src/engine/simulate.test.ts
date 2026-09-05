import { beforeEach, describe, expect, test } from 'vitest'
import type { Playthrough, Story } from '../domain/types'
import { branchingStory } from '../test/branching'
import { exits, replay, roll, startSimulation, suggestedStart, take, type Exit, type Simulation } from './simulate'

let story: Story

beforeEach(async () => {
  story = (await branchingStory()).story
})

const byLabel = (list: Exit[], label: string) => list.find((e) => e.label === label) as Exit

/** Walks the main storyline through the trusting ending. */
function trustingRun(): Simulation {
  let sim = startSimulation(story, 'offer')
  sim = take(story, sim, byLabel(exits(story, sim), 'Take the job'))
  return take(story, sim, byLabel(exits(story, sim), 'Trust Mara'))
}

describe('walking the story', () => {
  test('the suggested start is the first scene of the first storyline', () => {
    expect(suggestedStart(story)).toBe('offer')
  })

  test('entering a scene applies its effects and records a step', () => {
    const sim = startSimulation(story, 'offer')
    expect(sim.scene).toBe('offer')
    expect(sim.state.trust).toBe(1)
    expect(sim.steps).toEqual([{ scene: 'offer', state: sim.state }])
  })

  test('a scene with choices exits through them; a gated choice says why it is closed', () => {
    const list = exits(story, startSimulation(story, 'offer'))
    expect(list.map((e) => [e.kind, e.label, e.available])).toEqual([
      ['choice', 'Take the job', true],
      ['choice', 'Refuse', false],
    ])
    expect(byLabel(list, 'Refuse').reason).toBe('needs city_mood == rioting')
  })

  test('taking a choice applies its effects, then enters the target', () => {
    const sim = trustingRun()
    expect(sim.scene).toBe('ending')
    expect(sim.state).toMatchObject({ trust: 2, mara_alive: true })
    expect(sim.steps.map((s) => [s.scene, s.choice])).toEqual([
      ['offer', undefined],
      ['door', 'Take the job'],
      ['ending', 'Trust Mara'],
    ])
  })

  test('a choice to a scene nobody wrote is closed, and the walk ends when nothing is open', () => {
    const sim = trustingRun()
    const epilogue = byLabel(exits(story, sim), 'Epilogue')
    expect(epilogue.available).toBe(false)
    expect(epilogue.reason).toMatch(/doesn.t exist/)
  })

  test('without choices, the walk continues along the storyline; a gated next scene is closed', () => {
    const sim = startSimulation(story, 'pamphlets')
    const list = exits(story, sim)
    const next = byLabel(list, 'Continue along Rumours to The Uprising')
    expect(next).toMatchObject({ kind: 'continue', to: 'uprising', available: false, reason: 'needs rebellion_strength >= 2' })
  })

  test('a storylet whose condition holds is offered from anywhere, carrying its chance', () => {
    const before = exits(story, startSimulation(story, 'offer'))
    expect(before.some((e) => e.to === 'whisper')).toBe(false)
    const after = exits(story, trustingRun())
    expect(byLabel(after, 'A Whisper')).toMatchObject({ kind: 'storylet', to: 'whisper', available: true, chance: 50 })
    expect(after.some((e) => e.to === 'chapel')).toBe(false)
  })

  test('rolling picks among the open exits by weight', () => {
    let sim = startSimulation(story, 'offer')
    sim = take(story, sim, byLabel(exits(story, sim), 'Take the job'))
    // Both door choices carry no chance, so each weighs the same.
    expect(roll(story, sim, () => 0.1)?.label).toBe('Trust Mara')
    expect(roll(story, sim, () => 0.9)?.label).toBe('Seal it')
  })
})

describe('replaying a saved playthrough', () => {
  test('a playthrough that still fits the story replays clean', () => {
    const saved: Playthrough = { name: 'trusting', steps: trustingRun().steps }
    const result = replay(story, saved)
    expect(result.broken).toBeUndefined()
    expect(result.sim.scene).toBe('ending')
  })

  test('a playthrough whose choice no longer exists reports where it broke', () => {
    const saved: Playthrough = { name: 'trusting', steps: trustingRun().steps }
    const door = story.scenes.get('door') as NonNullable<ReturnType<Story['scenes']['get']>>
    story.scenes.set('door', { ...door, choices: door.choices.filter((c) => c.label !== 'Trust Mara') })
    const result = replay(story, saved)
    expect(result.broken).toEqual({ step: 2, reason: 'No open way from The Vault Door to Ashes or Embers by "Trust Mara"' })
  })

  test('a playthrough whose recorded state has drifted says which variable', () => {
    const steps = trustingRun().steps.map((s) => ({ ...s, state: { ...s.state } }))
    steps[2].state.trust = 7
    const result = replay(story, { name: 'trusting', steps })
    expect(result.broken).toEqual({ step: 2, reason: 'At Ashes or Embers, trust is 2 now; the playthrough recorded 7' })
  })
})
