import { describe, expect, test } from 'vitest'
import { branchingStory } from '../test/branching'
import { variableUsage } from './usage'

describe('variableUsage', () => {
  test('every write and read is listed with its scene and its place in it', async () => {
    const { story } = await branchingStory()
    const usage = variableUsage(story)

    const trust = usage.get('trust')!
    expect(trust.writes).toContainEqual({
      scene: 'offer',
      sceneTitle: 'The Offer',
      source: 'trust += 1',
      via: 'effect',
    })
    expect(trust.writes).toContainEqual({
      scene: 'door',
      sceneTitle: 'The Vault Door',
      source: 'trust += 1',
      via: 'choice "Trust Mara" effect',
    })
    expect(trust.reads).toContainEqual({
      scene: 'door',
      sceneTitle: 'The Vault Door',
      source: 'trust >= 1',
      via: 'choice "Trust Mara" gate',
    })
    expect(trust.reads).toContainEqual({
      scene: 'whisper',
      sceneTitle: 'A Whisper',
      source: 'trust >= 2',
      via: 'condition',
    })
  })

  test('a declared variable nobody touches has an empty ledger', async () => {
    const { story } = await branchingStory()
    expect(variableUsage(story).get('unused')).toEqual({ writes: [], reads: [] })
  })

  test('only declared variables appear as keys', async () => {
    const { story } = await branchingStory()
    const ids = [...variableUsage(story).keys()].sort()
    expect(ids).toEqual(story.registry.variables.map((v) => v.id).sort())
  })
})
