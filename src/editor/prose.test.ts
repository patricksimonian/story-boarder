import { Editor } from '@tiptap/core'
import { describe, expect, test } from 'vitest'
import { mentionsKey } from './mentions'
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

  test('mentions drawn over the text never enter it', () => {
    const prose = '"Go," said *Mara*, and Mara went.\n\nRook stayed.'
    const editor = new Editor({ extensions: proseExtensions(), content: prose, contentType: 'markdown' })
    try {
      editor.storage.mentionHighlights.find = (text: string) =>
        [...text.matchAll(/Mara|Rook/g)].map((m) => ({
          from: m.index,
          to: m.index + 4,
          quote: m[0],
          targets: [{ kind: 'character' as const, id: m[0].toLowerCase(), title: m[0] }],
          certainty: 'certain' as const,
        }))
      editor.view.dispatch(editor.state.tr.setMeta(mentionsKey, true))
      const drawn = [...editor.view.dom.querySelectorAll('.mention')].map((el) => el.textContent)
      expect(drawn).toEqual(['Mara', 'Mara', 'Rook'])
      expect(readProse(editor)).toBe(prose)
    } finally {
      editor.destroy()
    }
  })
})
