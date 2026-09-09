import { describe, expect, test } from 'vitest'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { canonicalTag, foldTag, tagIndex } from './canon'

describe('one tag, one spelling', () => {
  test('case, spacing, and stray characters collapse to one form', () => {
    expect(canonicalTag('NPC')).toBe('npc')
    expect(canonicalTag('  Dark Forest ')).toBe('dark-forest')
    expect(canonicalTag('dark_forest')).toBe('dark-forest')
    expect(canonicalTag('#Human!')).toBe('human')
    expect(canonicalTag('--')).toBe('')
    expect(canonicalTag('Tanner’s Row')).toBe('tanners-row')
  })

  test('a plural or singular of a tag the story has folds into it', () => {
    expect(foldTag('Humans', ['human', 'npc'])).toBe('human')
    expect(foldTag('human', ['humans'])).toBe('humans')
    expect(foldTag('Cities', ['city'])).toBe('city')
    expect(foldTag('city', ['cities'])).toBe('cities')
    expect(foldTag('HUMAN', ['Human'])).toBe('human')
    expect(foldTag('boss', ['bos'])).toBe('boss')
    expect(foldTag('elves', ['elf'])).toBe('elves')
    expect(foldTag('new one', [])).toBe('new-one')
  })

  test('the index counts every carrier under the canonical spelling', async () => {
    const files = embersFiles()
    await files.writeText('characters/mara.md', '---\nid: mara\ntags: [NPC, Human]\n---\n\n# Mara\n')
    await files.writeText('characters/rook.md', '---\nid: rook\ntags: [npc, crew]\n---\n\n# Rook\n')
    await files.writeText('notes/plan.md', '---\nid: plan\ntags: [Crew]\n---\n\n# Plan\n')
    const result = await loadStory(files)
    if (!result.ok) throw new Error(result.reason)
    expect(tagIndex(result.loaded.story)).toEqual([
      { tag: 'crew', count: 2 },
      { tag: 'npc', count: 2 },
      { tag: 'human', count: 1 },
    ])
  })
})
