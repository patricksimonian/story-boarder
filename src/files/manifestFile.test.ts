import { describe, expect, test } from 'vitest'
import { parseManifestFile } from './manifestFile'

const MANIFEST = JSON.stringify({
  title: 'Embers of the Vault',
  acts: [
    { id: 'act-1', title: 'Act I — The Spark' },
    { id: 'act-2', title: 'Act II — The Descent' },
  ],
  storylines: [
    { id: 'main', name: 'The Heist', color: '#5b6ee1', glyph: '◆', scenes: ['cold-open', 'the-job-offer'] },
    { id: 'mara', name: "Mara's Trust", color: '#d5548e', glyph: '●', scenes: ['the-job-offer'] },
  ],
  settings: {},
})

describe('parseManifestFile', () => {
  test('reads title, acts, and storylines with their scene order', () => {
    const result = parseManifestFile(MANIFEST)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.title).toBe('Embers of the Vault')
    expect(result.manifest.acts.map((a) => a.id)).toEqual(['act-1', 'act-2'])
    expect(result.manifest.storylines[0].scenes).toEqual(['cold-open', 'the-job-offer'])
    expect(result.manifest.storylines[1].glyph).toBe('●')
  })

  test('flags broken JSON', () => {
    const result = parseManifestFile('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toMatch(/JSON/i)
  })

  test('flags missing pieces without repairing them', () => {
    const result = parseManifestFile(
      JSON.stringify({ acts: [{ id: 'a' }], storylines: [{ id: 's', name: 'S' }] }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const all = result.problems.join('\n')
      expect(all).toMatch(/title/)
      expect(all).toMatch(/acts\[0\]/)
      expect(all).toMatch(/storylines\[0\]/)
    }
  })

  test('duplicate ids are flagged', () => {
    const result = parseManifestFile(
      JSON.stringify({
        title: 'T',
        acts: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }],
        storylines: [],
        settings: {},
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toMatch(/duplicate/i)
  })
})
