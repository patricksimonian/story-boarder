import { describe, expect, test } from 'vitest'
import { branchingStory } from '../test/branching'
import { analyse, type Finding } from './analyse'

const ofKind = (findings: Finding[], kind: Finding['kind']) => findings.filter((f) => f.kind === kind)

describe('static analysis', () => {
  test('an expression that does not check against the registry is an error on its scene', async () => {
    const findings = analyse((await branchingStory()).story)
    expect(ofKind(findings, 'expression')).toEqual([
      {
        severity: 'error',
        kind: 'expression',
        scene: 'typo',
        message: 'Condition `trusst >= 1`: `trusst` is not a registered variable',
      },
    ])
  })

  test('a choice to a scene nobody wrote is a dangling reference', async () => {
    const findings = analyse((await branchingStory()).story)
    expect(ofKind(findings, 'dangling')).toEqual([
      { severity: 'error', kind: 'dangling', scene: 'ending', message: 'Choice "Epilogue" leads to `epilogue`, which doesn’t exist' },
    ])
  })

  test('a choice whose gate nothing can ever open is a dead branch', async () => {
    const findings = analyse((await branchingStory()).story)
    expect(ofKind(findings, 'dead-branch')).toEqual([
      {
        severity: 'warning',
        kind: 'dead-branch',
        scene: 'offer',
        message: 'Choice "Refuse" can never be taken: it needs `city_mood == rioting`, and no effect ever changes city_mood from calm',
      },
    ])
  })

  test('a scene whose own gate nothing can ever open is unreachable', async () => {
    const findings = analyse((await branchingStory()).story)
    expect(ofKind(findings, 'unreachable')).toEqual([
      {
        severity: 'warning',
        kind: 'unreachable',
        scene: 'chapel',
        message: 'The Drowned Chapel can never fire: it needs `visited_undercity`, and no effect ever changes visited_undercity from false',
      },
    ])
  })

  test('variables never set and never read are noted', async () => {
    const findings = analyse((await branchingStory()).story)
    expect(ofKind(findings, 'never-set').map((f) => f.message)).toEqual([
      '`visited_undercity` is read by a condition but no effect ever sets it',
      '`city_mood` is read by a condition but no effect ever sets it',
      '`unused` is never set and never read',
    ])
    expect(ofKind(findings, 'never-read').map((f) => f.message)).toEqual(['`mara_alive` is set by effects but no condition ever reads it'])
  })

  test('findings come most severe first', async () => {
    const findings = analyse((await branchingStory()).story)
    const order = findings.map((f) => f.severity)
    const rank = { error: 0, warning: 1, note: 2 }
    expect([...order].sort((a, b) => rank[a] - rank[b])).toEqual(order)
  })
})
