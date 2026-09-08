import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * Mentions in the app: prose that names a library page lights up, the
 * tooltip opens that page, a ruling lands in mentions.json, and an alias
 * typed on a page is a name from then on.
 */

const CISTERN = `---
id: the-dry-cistern
storylines: [mara]
act: act-2
---

# The Dry Cistern

## Synopsis

Mara talks first.

## Beats

1. Something shifts.

## Prose

Mara watched the door out of habit. Maara stopped watching it. The door-woman spoke.
`

async function openStory(world: TestWorld): Promise<void> {
  render(<App platform={world.platform} autosaveDelayMs={20} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
}

async function openCistern(): Promise<HTMLElement> {
  await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Dry Cistern' })[0])
  return screen.findByRole('dialog', { name: /scene editor/i })
}

const mentionsIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.mention')]

describe('mentions in the app', () => {
  test('prose naming a character lights up, and the tooltip opens the page', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    await openStory(world)
    const editor = await openCistern()
    await waitFor(() => expect(mentionsIn(editor)).toHaveLength(2))
    const [certain, probable] = mentionsIn(editor)
    expect(certain).toHaveTextContent('Mara')
    expect(certain.className).toContain('mention-certain')
    expect(probable).toHaveTextContent('Maara')
    expect(probable.className).toContain('mention-probable')

    await userEvent.hover(certain)
    const tip = await screen.findByRole('dialog', { name: /mention: mara/i })
    expect(tip).toHaveTextContent('Character')
    expect(tip).toHaveTextContent('The door-woman.')
    await userEvent.click(within(tip).getByRole('button', { name: 'Open character Mara' }))

    const library = await screen.findByRole('region', { name: /^library$/i })
    await waitFor(() => expect(within(library).getByRole('textbox', { name: /^title$/i })).toHaveValue('Mara'))
    expect(screen.queryByRole('dialog', { name: /scene editor/i })).not.toBeInTheDocument()
  })

  test('a ruling lands in mentions.json and the span is gone on the redraw', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    await openStory(world)
    const editor = await openCistern()
    await waitFor(() => expect(mentionsIn(editor)).toHaveLength(2))

    await userEvent.hover(mentionsIn(editor)[0])
    await screen.findByRole('dialog', { name: /mention: mara/i })
    await userEvent.click(screen.getByRole('button', { name: 'Not a mention' }))

    await waitFor(async () => expect(await world.files.exists('mentions.json')).toBe(true))
    expect(JSON.parse(await world.files.readText('mentions.json'))).toEqual({
      'scene:the-dry-cistern': [{ quote: 'Mara', entity: null, by: 'writer' }],
    })
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Maara']))
  })

  test('the page knows where it is named, and the card can open the page in place', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    await world.files.writeText('notes/plan.md', '---\nid: plan\n---\n\n# The Plan\n\nMara goes first.\n')
    await openStory(world)
    await userEvent.click(screen.getByRole('button', { name: /📇 library/i }))
    const library = within(await screen.findByRole('region', { name: /^library$/i }))
    await userEvent.click(library.getByRole('button', { name: 'Open character Mara' }))
    const named = within(await library.findByRole('region', { name: 'Named in' }))
    expect(named.getByRole('button', { name: 'Open scene The Dry Cistern' })).toBeInTheDocument()
    expect(named.getByRole('button', { name: 'Open note The Plan' })).toBeInTheDocument()
    await userEvent.click(named.getByRole('button', { name: 'Open note The Plan' }))
    const notes = within(await screen.findByRole('region', { name: /^notes$/i }))
    await waitFor(() => expect(notes.getByRole('textbox', { name: /^title$/i })).toHaveValue('The Plan'))
    // And from the note, the same page opens inside the card.
    await waitFor(() => expect(mentionsIn(notes.getByRole('textbox', { name: /prose/i }))).toHaveLength(1))
    await userEvent.hover(mentionsIn(notes.getByRole('textbox', { name: /prose/i }))[0])
    await screen.findByRole('dialog', { name: /mention: mara/i })
    await userEvent.click(screen.getByRole('button', { name: 'Expand Mara' }))
    const page = await screen.findByLabelText('Mara, in full')
    expect(page).toHaveTextContent('The door-woman.')
    expect(within(page).getByRole('button', { name: 'Open scene The Dry Cistern' })).toBeInTheDocument()
  })

  test('an alias typed on a page is a name the prose lights up', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    await openStory(world)
    await userEvent.click(screen.getByRole('button', { name: /📇 library/i }))
    const library = await screen.findByRole('region', { name: /^library$/i })
    await userEvent.click(within(library).getByRole('button', { name: 'Open character Mara' }))
    await userEvent.type(within(library).getByRole('textbox', { name: /^aliases$/i }), 'the door-woman')
    await waitFor(async () => expect(await world.files.readText('characters/mara.md')).toContain('aliases: [the door-woman]'))

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: /storylines/i }))
    const editor = await openCistern()
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Mara', 'Maara', 'The door-woman']))
  })
})
