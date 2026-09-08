import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { MentionContext } from '../mentions/context'
import type { Span } from '../mentions/match'
import { ProseEditor } from './ProseEditor'

/**
 * The editor with a mention context: spans are drawn over the text and
 * never written into it; hovering one answers for it; the tooltip's
 * actions go up to the app, except a spelling fix, which is an edit.
 */

function rookFinder(text: string): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(/\bRook\b/g)) {
    spans.push({ from: match.index, to: match.index + 4, quote: 'Rook', targets: [{ kind: 'character', id: 'rook', title: 'Rook' }], certainty: 'certain' })
  }
  for (const match of text.matchAll(/\bRok's\b/g)) {
    spans.push({ from: match.index, to: match.index + 5, quote: "Rok's", targets: [{ kind: 'character', id: 'rook', title: 'Rook' }], certainty: 'probable' })
  }
  return spans
}

function context(overrides: Partial<MentionContext> = {}): MentionContext {
  return {
    find: rookFinder,
    describe: (key) =>
      key === 'character:rook'
        ? { key, kind: 'character', title: 'Rook', lines: ['A lifter with a talent for being under the wrong awning.'], others: ['Cold Open', 'Tanner’s Row'], othersCount: 5 }
        : undefined,
    onOpen: vi.fn(),
    onVerdict: vi.fn(),
    ...overrides,
  }
}

const mentionEls = () => [...document.querySelectorAll<HTMLElement>('.mention')]

describe('mentions in the prose editor', () => {
  test('a mention is drawn over the text, and the text stays what it was', async () => {
    const onChange = vi.fn()
    render(<ProseEditor markdown="Rook fed the stove. Rook watched." onChange={onChange} mentions={context()} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(2))
    expect(mentionEls()[0]).toHaveTextContent('Rook')
    expect(mentionEls()[0].dataset.targets).toBe('character:rook')
    expect(mentionEls()[0].className).toContain('mention-certain')
    expect(screen.getByRole('textbox', { name: /prose/i })).toHaveTextContent('Rook fed the stove. Rook watched.')
    expect(onChange).not.toHaveBeenCalled()
  })

  test('hovering opens the card: kind, title, what the page says, where else it is named; open goes up', async () => {
    const ctx = context()
    render(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    await userEvent.hover(mentionEls()[0])
    const tip = await screen.findByRole('dialog', { name: /mention: rook/i })
    expect(tip).toHaveTextContent('Character')
    expect(tip).toHaveTextContent('A lifter with a talent')
    expect(tip).toHaveTextContent('Also named in Cold Open, Tanner’s Row and 3 more')
    await userEvent.click(screen.getByRole('button', { name: 'Open character Rook' }))
    expect(ctx.onOpen).toHaveBeenCalledWith('character:rook')
  })

  test('a near miss asks, and fixing the spelling is an edit that keeps the possessive', async () => {
    const ctx = context()
    const onChange = vi.fn()
    render(<ProseEditor markdown="Rok's stove." onChange={onChange} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    expect(mentionEls()[0].className).toContain('mention-probable')
    await userEvent.hover(mentionEls()[0])
    const tip = await screen.findByRole('dialog', { name: /mention: rok's/i })
    expect(tip).toHaveTextContent('Did you mean Rook?')
    await userEvent.click(screen.getByRole('button', { name: 'Fix spelling' }))
    expect(onChange).toHaveBeenLastCalledWith("Rook's stove.")
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('the rulings go up as verdicts on the quoted phrase', async () => {
    const ctx = context()
    render(<ProseEditor markdown="Rok's stove." onChange={() => {}} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    await userEvent.hover(mentionEls()[0])
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'It is Rook' }))
    expect(ctx.onVerdict).toHaveBeenCalledWith("Rok's", 'character:rook')

    await userEvent.hover(mentionEls()[0])
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Not a mention' }))
    expect(ctx.onVerdict).toHaveBeenCalledWith("Rok's", null)
  })

  test('a new finder redraws without remounting the editor', async () => {
    const { rerender } = render(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} mentions={context()} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    rerender(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} mentions={context({ find: () => [] })} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(0))
    expect(screen.getByRole('textbox', { name: /prose/i })).toHaveTextContent('Rook fed the stove.')
  })

  test('without a context the editor is the editor it was', async () => {
    render(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: /prose/i })).toHaveTextContent('Rook fed the stove.')
    expect(mentionEls()).toHaveLength(0)
  })
})
