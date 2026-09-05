import { describe, expect, test } from 'vitest'
import { parseReferenceFile, serializeReferenceFile } from './referenceFile'

describe('parseReferenceFile', () => {
  test('reads a character with tags and body', () => {
    const result = parseReferenceFile(
      'character',
      'mara',
      '---\nid: mara\ntags: [crew, safecracker]\n---\n\n# Mara\n\nThe door-woman. Branded with the Warden’s eye.\n',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entity).toEqual({
      kind: 'character',
      id: 'mara',
      title: 'Mara',
      tags: ['crew', 'safecracker'],
      images: [],
      body: 'The door-woman. Branded with the Warden’s eye.',
    })
  })

  test('images ride the frontmatter and round-trip', () => {
    const result = parseReferenceFile(
      'character',
      'mara',
      '---\nid: mara\nimages: [assets/mara-sketch.png, assets/wrist-brand.jpg]\n---\n\n# Mara\n',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entity.images).toEqual(['assets/mara-sketch.png', 'assets/wrist-brand.jpg'])
    const text = serializeReferenceFile(result.entity)
    expect(text).toContain('images:')
    expect(text).toContain('assets/mara-sketch.png')
    const again = parseReferenceFile('character', 'mara', text)
    expect(again.ok && again.entity).toEqual(result.entity)
  })

  test('an entity without images serializes none', () => {
    const text = serializeReferenceFile({ kind: 'place', id: 'the-vault', title: 'The Vault', tags: [], images: [], body: '' })
    expect(text).not.toContain('images')
  })

  test('flags a missing title', () => {
    const result = parseReferenceFile('place', 'the-vault', '---\nid: the-vault\n---\nno heading\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toMatch(/# Title/i)
  })
})
