import { describe, expect, test } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { loadStory } from '../story/loadStory'
import { startStory } from '../story/mutations'
import { branchingStory } from '../test/branching'
import { checkLessons, LESSONS, PATTERNS } from './lessons'

describe('the coach lessons', () => {
  test('a bare story has every lesson still to do', async () => {
    const files = new InMemoryFileAccess()
    await startStory(files, 'Bare')
    const result = await loadStory(files)
    if (!result.ok) throw new Error(result.reason)
    const checked = checkLessons(result.loaded.story)
    expect(checked).toHaveLength(LESSONS.length)
    expect(checked.every((l) => !l.done)).toBe(true)
  })

  test('the branching story has done what it has done, with evidence in its own terms', async () => {
    const { story } = await branchingStory()
    const byId = new Map(checkLessons(story).map((l) => [l.id, l]))

    expect(byId.get('declare')).toMatchObject({ done: true })
    expect(byId.get('declare')?.evidence).toContain('trust')
    expect(byId.get('write')).toMatchObject({ done: true })
    expect(byId.get('write')?.evidence).toMatch(/sets `.+`/)
    expect(byId.get('read')).toMatchObject({ done: true })
    expect(byId.get('loop')).toMatchObject({ done: true })
    expect(byId.get('loop')?.evidence).toContain('trust')
    expect(byId.get('fork')).toMatchObject({ done: true })
    expect(byId.get('fork')?.evidence).toContain('The Vault Door')
    // No playthrough is saved in the fixture — the walk is still to do.
    expect(byId.get('walk')).toMatchObject({ done: false })
  })

  test('every lesson and pattern card carries its words', () => {
    for (const lesson of LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(0)
      expect(lesson.why.length).toBeGreaterThan(0)
      expect(lesson.how.length).toBeGreaterThan(0)
    }
    expect(PATTERNS.length).toBeGreaterThanOrEqual(5)
    for (const card of PATTERNS) {
      expect(card.name.length).toBeGreaterThan(0)
      expect(card.gist.length).toBeGreaterThan(0)
    }
  })
})
