import { describe, expect, it } from 'vitest'
import { parseNoteFile, serializeNoteFile } from './noteFile'

/**
 * One `notes/<slug>.md` per Note: freeform writing with a `# Title`
 * heading, grouped by an optional `section` in the frontmatter — flat
 * folder, structure in the file, never in the path.
 */

const NOTE = `---
id: vault-timeline
section: research
tags: [heist, timeline]
---

# Vault Timeline

Three days between the pamphlets and the job offer.

Maybe four.
`

describe('parseNoteFile', () => {
  it('reads id, section, tags, title, and the body', () => {
    const result = parseNoteFile('vault-timeline', NOTE)
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.note).toEqual({
      id: 'vault-timeline',
      title: 'Vault Timeline',
      section: 'research',
      tags: ['heist', 'timeline'],
      body: 'Three days between the pamphlets and the job offer.\n\nMaybe four.',
    })
  })

  it('accepts a sectionless note', () => {
    const result = parseNoteFile('loose', '---\nid: loose\n---\n\n# Loose Thought\n\nJot.\n')
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.note.section).toBeUndefined()
    expect(result.note.title).toBe('Loose Thought')
  })

  it('flags a missing title and a mismatched id, never repairing', () => {
    const untitled = parseNoteFile('x', '---\nid: x\n---\n\nNo heading here.\n')
    expect(untitled.ok).toBe(false)
    if (!untitled.ok) expect(untitled.problems.join(' ')).toMatch(/# Title/)

    const mismatched = parseNoteFile('right', '---\nid: wrong\n---\n\n# T\n')
    expect(mismatched.ok).toBe(false)
  })
})

describe('serializeNoteFile', () => {
  it('round-trips through parse', () => {
    const result = parseNoteFile('vault-timeline', NOTE)
    if (!result.ok) throw new Error(result.problems.join('; '))
    const again = parseNoteFile('vault-timeline', serializeNoteFile(result.note))
    if (!again.ok) throw new Error(again.problems.join('; '))
    expect(again.note).toEqual(result.note)
  })

  it('keeps empty fields out of the frontmatter', () => {
    const text = serializeNoteFile({ id: 'loose', title: 'Loose Thought', tags: [], body: '' })
    expect(text).not.toContain('section')
    expect(text).not.toContain('tags')
    expect(text).toBe('---\nid: loose\n---\n\n# Loose Thought\n')
  })
})
