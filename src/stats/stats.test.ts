import { describe, expect, test } from 'vitest'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { countWords, storyStats } from './stats'

describe('countWords', () => {
  test('counts words, not markup or blank runs', () => {
    expect(countWords('The gate had one keeper too many.')).toBe(7)
    expect(countWords('')).toBe(0)
    expect(countWords('  \n\n  ')).toBe(0)
    expect(countWords('**bold** and _quiet_')).toBe(3)
  })
})

describe('storyStats', () => {
  test('totals prose across scenes and lists every entry with its count', async () => {
    const files = embersFiles()
    await files.writeText(
      'scenes/written.md',
      '---\nid: written\n---\n\n# Written\n\n## Prose\n\nSeven words of actual prose right here.\n',
    )
    await files.writeText('notes/plan.md', '---\nid: plan\n---\n\n# Plan\n\nFour words of note.\n')
    const result = await loadStory(files)
    if (!result.ok) throw new Error(result.reason)
    const stats = storyStats(result.loaded.story)

    const written = stats.scenes.find((s) => s.id === 'written')
    expect(written?.words).toBe(7)
    expect(stats.sceneWords).toBeGreaterThanOrEqual(7)
    expect(stats.scenes.length).toBe(result.loaded.story.scenes.size)
    expect(stats.notes.find((n) => n.id === 'plan')?.words).toBe(4)
    expect(stats.references.find((r) => r.id === 'mara')?.words).toBe(2)
  })
})
