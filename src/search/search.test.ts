import { describe, expect, test } from 'vitest'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { searchStory } from './search'

async function story() {
  const files = embersFiles()
  await files.writeText('notes/timeline.md', '---\nid: timeline\n---\n\n# Timeline\n\nThree days between the pamphlets and the job offer.\n')
  await files.writeText('places/the-vault.md', '---\nid: the-vault\ntags: [underhive]\n---\n\n# The Vault\n\nOlder than the city above it.\n')
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded.story
}

describe('searchStory', () => {
  test('finds matches across scenes, notes, and reference entities', async () => {
    const hits = searchStory(await story(), 'vault')
    const kinds = new Set(hits.map((h) => h.kind))
    expect(kinds.has('scene')).toBe(true)
    expect(kinds.has('place')).toBe(true)
  })

  test('a title hit outranks a body hit, and snippets window the match', async () => {
    const hits = searchStory(await story(), 'pamphlets')
    expect(hits[0]).toMatchObject({ kind: 'scene', id: 'pamphlets' })
    const note = hits.find((h) => h.kind === 'note')
    expect(note?.snippet).toContain('pamphlets')
    expect(note?.snippet.length).toBeLessThan(120)
  })

  test('every word must land somewhere in the same entry', async () => {
    const hits = searchStory(await story(), 'city above')
    expect(hits.map((h) => h.id)).toEqual(['the-vault'])
    expect(searchStory(await story(), 'city nowhere-word')).toEqual([])
  })

  test('the empty query finds nothing rather than everything', async () => {
    expect(searchStory(await story(), '  ')).toEqual([])
  })
})
