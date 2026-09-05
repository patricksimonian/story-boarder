import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

async function openEmbers(): Promise<TestWorld> {
  const world = embersWorld()
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return world
}

async function manifest(world: TestWorld) {
  return JSON.parse(await world.files.readText('story.json'))
}

describe('managing storylines from the sidebar', () => {
  test('the storyline name navigates to its lane — only the pencil opens the edit dialog', async () => {
    await openEmbers()
    const sidebar = screen.getByRole('complementary')
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled

    // From another view, the name walks back to the board with the lane in view.
    await userEvent.click(within(sidebar).getByRole('button', { name: /overview/i }))
    await userEvent.click(within(sidebar).getByRole('button', { name: "Go to storyline Mara's Trust" }))
    expect(screen.queryByRole('dialog', { name: /edit storyline/i })).not.toBeInTheDocument()
    await waitFor(() => expect(scrolled).toHaveBeenCalled())
    expect(document.querySelector('.b-lanelabel[data-storyline="mara"]')).toBeInTheDocument()

    await userEvent.click(within(sidebar).getByRole('button', { name: 'Edit storyline The Heist' }))
    expect(screen.getByRole('dialog', { name: /edit storyline/i })).toBeInTheDocument()
  })

  test('a storyline can be renamed, re-glyphed, and recolored in place', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit storyline The Heist' })[0])
    const dialog = screen.getByRole('dialog', { name: /edit storyline/i })
    const name = within(dialog).getByLabelText(/name/i)
    await userEvent.clear(name)
    await userEvent.type(name, 'The Vault Job')
    await userEvent.click(within(dialog).getByRole('radio', { name: '★' }))
    fireEvent.change(within(dialog).getByLabelText(/color/i), { target: { value: '#123456' } })
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect((await screen.findAllByRole('button', { name: 'Edit storyline The Vault Job' })).length).toBeGreaterThan(0)
    expect((await manifest(world)).storylines[0]).toMatchObject({ id: 'heist', name: 'The Vault Job', glyph: '★', color: '#123456' })
  })

  test('moving a storyline down swaps its lane with the next one', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit storyline The Heist' })[0])
    const dialog = screen.getByRole('dialog', { name: /edit storyline/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /move down/i }))
    expect(await within(dialog).findByText(/lane 2 of 3/i)).toBeInTheDocument()
    expect((await manifest(world)).storylines.map((s: { id: string }) => s.id)).toEqual(['mara', 'heist', 'rebellion'])
  })

  test('deleting a storyline asks first, then frees its scenes', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getAllByRole('button', { name: "Edit storyline Mara's Trust" })[0])
    const dialog = screen.getByRole('dialog', { name: /edit storyline/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /delete storyline…/i }))
    // The Job Offer is shared with The Heist; The Dry Cistern is Mara's alone.
    expect(within(dialog).getByText(/2 scenes lose this membership; 1 goes to the idea pool/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete storyline$/i }))

    expect(await screen.findByRole('button', { name: /idea pool \(2\)/i })).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: "Edit storyline Mara's Trust" })).toHaveLength(0)
    expect((await manifest(world)).storylines).toHaveLength(2)
    expect(await world.files.readText('scenes/the-dry-cistern.md')).not.toContain('storylines')
  })
})

describe('managing acts from the sidebar', () => {
  test('an act can be renamed and moved', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit act Act II — The Descent' })[0])
    const dialog = screen.getByRole('dialog', { name: /edit act/i })
    const title = within(dialog).getByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Act II — The Long Fall')
    await userEvent.click(within(dialog).getByRole('button', { name: /move up/i }))
    expect(await within(dialog).findByText(/act 1 of 2/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect(await screen.findByRole('button', { name: 'Act II — The Long Fall' })).toBeInTheDocument()
    expect((await manifest(world)).acts.map((a: { id: string }) => a.id)).toEqual(['act-2', 'act-1'])
  })

  test('an act holding scenes cannot be deleted; an empty one can', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit act Act I — The Spark' })[0])
    let dialog = screen.getByRole('dialog', { name: /edit act/i })
    expect(within(dialog).getByRole('button', { name: /delete act/i })).toBeDisabled()
    expect(within(dialog).getByText(/holds 3 scenes/i)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: /new act/i }))
    const create = screen.getByRole('dialog', { name: /new act/i })
    await userEvent.type(within(create).getByLabelText(/title/i), 'Act III')
    await userEvent.click(within(create).getByRole('button', { name: /^create$/i }))
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit act Act III' }))[0])
    dialog = screen.getByRole('dialog', { name: /edit act/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /delete act…/i }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete act$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await manifest(world)).acts).toHaveLength(2)
  })
})

async function openEditor(title: string) {
  await userEvent.click(screen.getAllByRole('button', { name: `Open scene ${title}` })[0])
  return screen.findByRole('dialog', { name: /scene editor/i })
}

describe('placement from the editor', () => {
  test('ticking a storyline adds the membership; the board grows a card in that lane', async () => {
    const world = await openEmbers()
    expect(screen.getAllByRole('button', { name: 'Open scene The Dry Cistern' })).toHaveLength(1)
    const editor = await openEditor('The Dry Cistern')
    await userEvent.click(within(editor).getByRole('checkbox', { name: /the heist/i }))

    expect(await within(editor).findByRole('checkbox', { name: /the heist/i })).toBeChecked()
    await userEvent.keyboard('{Escape}')
    expect(screen.getAllByRole('button', { name: 'Open scene The Dry Cistern' })).toHaveLength(2)
    expect((await manifest(world)).storylines[0].scenes).toEqual(['cold-open', 'the-job-offer', 'embers', 'the-dry-cistern'])
    expect(await world.files.readText('scenes/the-dry-cistern.md')).toContain('- heist')
  })

  test('changing the act moves the scene to that column', async () => {
    const world = await openEmbers()
    const editor = await openEditor('The Dry Cistern')
    await userEvent.selectOptions(within(editor).getByRole('combobox', { name: /act/i }), 'act-1')
    expect(await within(editor).findByRole('combobox', { name: /act/i })).toHaveValue('act-1')
    expect(await world.files.readText('scenes/the-dry-cistern.md')).toContain('act: act-1')
  })

  test('unticking every storyline sends the scene to the idea pool', async () => {
    await openEmbers()
    const editor = await openEditor('The Dry Cistern')
    await userEvent.click(within(editor).getByRole('checkbox', { name: /mara/i }))
    expect(await within(editor).findByText(/idea pool — unplaced/i)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /idea pool \(2\)/i })).toBeInTheDocument()
  })

  test('typed text survives a placement change', async () => {
    const world = await openEmbers()
    const editor = await openEditor('The Dry Cistern')
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' Then she stops.')
    await userEvent.click(within(editor).getByRole('checkbox', { name: /the heist/i }))
    expect(await within(editor).findByRole('checkbox', { name: /the heist/i })).toBeChecked()
    expect(within(editor).getByRole('textbox', { name: /synopsis/i })).toHaveValue('Mara talks first. Then she stops.')
    expect(await world.files.readText('scenes/the-dry-cistern.md')).toContain('Then she stops.')
  })
})

describe('deleting a scene', () => {
  test('asks first, then the file goes and the editor closes', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    const editor = await openEditor('Rooftop Duel')
    await userEvent.click(within(editor).getByRole('button', { name: /delete scene…/i }))
    await userEvent.click(within(editor).getByRole('button', { name: /^delete scene$/i }))

    expect(await screen.findByRole('button', { name: /idea pool \(0\)/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /scene editor/i })).not.toBeInTheDocument()
    expect(await world.files.exists('scenes/rooftop-duel.md')).toBe(false)
  })

  test('a choice that pointed at it shows up in the problems bar', async () => {
    const world = embersWorld()
    const offer = await world.files.readText('scenes/the-job-offer.md')
    await world.files.writeText(
      'scenes/the-job-offer.md',
      offer.replace('condition: trust >= 1\n', 'condition: trust >= 1\nchoices:\n  - label: Walk away\n    to: rooftop-duel\n'),
    )
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })

    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    const editor = await openEditor('Rooftop Duel')
    await userEvent.click(within(editor).getByRole('button', { name: /delete scene…/i }))
    await userEvent.click(within(editor).getByRole('button', { name: /^delete scene$/i }))

    await userEvent.click(await screen.findByRole('button', { name: /2 files need attention/i }))
    expect(screen.getByRole('button', { name: /the-job-offer\.md.*Walk away/i })).toBeInTheDocument()
  })
})
