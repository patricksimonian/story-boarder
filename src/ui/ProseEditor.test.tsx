import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { MentionCard, MentionContext } from '../mentions/context'
import type { Span } from '../mentions/match'
import { ProseEditor } from './ProseEditor'

/**
 * The editor with a mention context: spans are drawn over the text and
 * never written into it; hovering one answers for it; Ctrl+click follows
 * it; Expand opens the whole page in the card; the tooltip's actions go
 * up to the app, except a spelling fix, which is an edit.
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

const rookCard: MentionCard = {
  key: 'character:rook',
  kind: 'character',
  title: 'Rook',
  lines: ['A lifter with a talent for being under the wrong awning.'],
  others: ['Cold Open', 'Tanner’s Row'],
  othersCount: 5,
  body: '# Rook\n\nA lifter with a talent for being under the wrong awning at the right time.\n\nOwns nothing but the *ledger scrap* that starts everything.',
  tags: ['crew', 'protagonist'],
  aliases: ['the lifter'],
  developments: [{ item: { kind: 'scene', id: 'cold-open', title: 'Cold Open' }, fact: 'Rook has the ledger scrap.', quote: 'Rook gets out with the ledger scrap.' }],
  namedIn: [
    { kind: 'scene', id: 'cold-open', title: 'Cold Open' },
    { kind: 'note', id: 'plan', title: 'The Plan' },
  ],
  images: ['assets/rook.png'],
}

function context(overrides: Partial<MentionContext> = {}): MentionContext {
  return {
    find: rookFinder,
    describe: (key) => (key === 'character:rook' ? rookCard : undefined),
    onOpen: vi.fn(),
    onVerdict: vi.fn(),
    imageUrl: async (path) => `blob:test/${path}`,
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

  test('hovering opens the card: kind, title, what the page says, a picture, where else it is named; the title is the link', async () => {
    const ctx = context()
    render(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    await userEvent.hover(mentionEls()[0])
    const tip = await screen.findByRole('dialog', { name: /mention: rook/i })
    expect(tip).toHaveTextContent('Character')
    expect(tip).toHaveTextContent('A lifter with a talent')
    expect(tip).toHaveTextContent('Also named in Cold Open, Tanner’s Row and 3 more')
    expect(await within(tip).findByRole('img', { name: 'rook.png' })).toHaveAttribute('src', 'blob:test/assets/rook.png')
    await userEvent.click(screen.getByRole('button', { name: 'Open character Rook' }))
    expect(ctx.onOpen).toHaveBeenCalledWith('character:rook')
  })

  test('Ctrl+click on a mention follows it without a card', async () => {
    const ctx = context()
    render(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    fireEvent.mouseDown(mentionEls()[0], { ctrlKey: true, button: 0 })
    expect(ctx.onOpen).toHaveBeenCalledWith('character:rook')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Expand opens the whole page in the card: its text as paragraphs, tags and aliases, developments, and every namer as a link', async () => {
    const ctx = context()
    render(<ProseEditor markdown="Rook fed the stove." onChange={() => {}} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    await userEvent.hover(mentionEls()[0])
    await screen.findByRole('dialog', { name: /mention: rook/i })
    await userEvent.click(screen.getByRole('button', { name: 'Expand Rook' }))
    const page = await screen.findByLabelText('Rook, in full')
    expect(page).toHaveTextContent('A lifter with a talent for being under the wrong awning at the right time.')
    expect(page).toHaveTextContent('Owns nothing but the ledger scrap that starts everything.')
    expect(page).not.toHaveTextContent('# Rook')
    expect(page).toHaveTextContent('Tags: crew, protagonist. Also called the lifter.')
    expect(page).toHaveTextContent('Rook has the ledger scrap.')
    expect(within(page).getByRole('img', { name: 'rook.png' })).toBeInTheDocument()
    await userEvent.click(within(page).getByRole('button', { name: 'Open note The Plan' }))
    expect(ctx.onOpen).toHaveBeenCalledWith('note:plan')
    // The card stays while the mouse wanders, since it was opened on purpose.
    await userEvent.unhover(mentionEls()[0])
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.getByRole('dialog', { name: /mention: rook/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Rook' }))
    expect(screen.queryByLabelText('Rook, in full')).not.toBeInTheDocument()
  })

  test('an orange name offers to create the thing, the read’s guess first, or to say it is nothing', async () => {
    const ctx = context({
      find: (text) => {
        const at = text.indexOf('Kal’ewei')
        return at < 0 ? [] : [{ from: at, to: at + 8, quote: 'Kal’ewei', targets: [], certainty: 'unknown' }]
      },
      onCreate: vi.fn(),
      suggestedKind: () => 'place',
    })
    render(<ProseEditor markdown="The rail to Kal’ewei is done." onChange={() => {}} mentions={ctx} />)
    await waitFor(() => expect(mentionEls()).toHaveLength(1))
    expect(mentionEls()[0].className).toContain('mention-unknown')
    await userEvent.hover(mentionEls()[0])
    const tip = await screen.findByRole('dialog', { name: /mention: kal’ewei/i })
    expect(tip).toHaveTextContent('Kal’ewei is mentioned, but nothing in the story describes it. Suggested: a place.')
    const buttons = within(tip).getAllByRole('button').map((b) => b.textContent)
    expect(buttons[0]).toBe('Create place')
    expect(buttons).toContain('Not a thing')
    await userEvent.click(within(tip).getByRole('button', { name: 'Create place' }))
    expect(ctx.onCreate).toHaveBeenCalledWith('place', 'Kal’ewei')

    await userEvent.hover(mentionEls()[0])
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Not a thing' }))
    expect(ctx.onVerdict).toHaveBeenCalledWith('Kal’ewei', null)
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
