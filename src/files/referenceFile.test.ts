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
      aliases: [],
      body: 'The door-woman. Branded with the Warden’s eye.',
    })
  })

  test('aliases ride the frontmatter, quoted when they must be, and round-trip', () => {
    const result = parseReferenceFile(
      'character',
      'rook',
      "---\nid: rook\naliases: [the smith, \"Rook of Tanner's Row\", '  ', \"the old man: retired\"]\n---\n\n# Rook\n",
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entity.aliases).toEqual(['the smith', "Rook of Tanner's Row", 'the old man: retired'])
    const text = serializeReferenceFile(result.entity)
    expect(text).toBe("---\nid: rook\naliases: [the smith, \"Rook of Tanner's Row\", \"the old man: retired\"]\n---\n\n# Rook\n")
    const again = parseReferenceFile('character', 'rook', text)
    expect(again.ok && again.entity).toEqual(result.entity)
  })

  test('aliases must be strings', () => {
    const result = parseReferenceFile('character', 'rook', '---\nid: rook\naliases: smith\n---\n\n# Rook\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toMatch(/aliases/)
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
    const text = serializeReferenceFile({ kind: 'place', id: 'the-vault', title: 'The Vault', tags: [], images: [], aliases: [], body: '' })
    expect(text).not.toContain('images')
    expect(text).not.toContain('aliases')
  })

  test('flags a missing title', () => {
    const result = parseReferenceFile('place', 'the-vault', '---\nid: the-vault\n---\nno heading\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toMatch(/# Title/i)
  })
})
