import { Editor } from '@tiptap/core'
import { describe, expect, test } from 'vitest'
import { proseExtensions, readProse } from './prose'

/** The prose seam: what goes into the editor from the file, and what comes back out. */
function roundTrip(markdown: string): string {
  const editor = new Editor({ extensions: proseExtensions(), content: markdown, contentType: 'markdown' })
  try {
    return readProse(editor)
  } finally {
    editor.destroy()
  }
}

describe('prose survives the trip through the editor', () => {
  test('paragraphs and emphasis come back as they went in', () => {
    const prose = 'The gate had one keeper too many.\n\nAnd *one* plan too **few**.'
    expect(roundTrip(prose)).toBe(prose)
  })

  test('empty prose stays empty', () => {
    expect(roundTrip('')).toBe('')
  })

  test('a heading inside prose sits below the file sections it lives under', () => {
    // `## ` would open a new file section; the editor only offers deeper levels.
    expect(roundTrip('### Later that night\n\nRook waited.')).toBe('### Later that night\n\nRook waited.')
    expect(roundTrip('## Not a section\n\nRook waited.')).toBe('### Not a section\n\nRook waited.')
  })

  test('dialogue lines and lists keep their shape', () => {
    const prose = '"Go," said Mara.\n\n- the ledger\n- the key\n\n> Nobody leaves.'
    expect(roundTrip(prose)).toBe(prose)
  })
})
