import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

async function openEmbers() {
  const world = embersWorld()
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return world
}

async function openScene(title: string) {
  const world = await openEmbers()
  await userEvent.click(screen.getAllByRole('button', { name: `Open scene ${title}` })[0])
  return { world, editor: await screen.findByRole('dialog', { name: /scene editor/i }) }
}

describe('the slide-over editor', () => {
  test('a card opens the scene with its title, memberships, synopsis, beats, and prose', async () => {
    const { editor } = await openScene('The Job Offer')
    expect(within(editor).getByRole('textbox', { name: /title/i })).toHaveValue('The Job Offer')
    expect(within(editor).getByText('The Heist')).toBeInTheDocument()
    expect(within(editor).getByText("Mara's Trust")).toBeInTheDocument()
    expect(within(editor).getByText('Act I — The Spark')).toBeInTheDocument()
    expect(within(editor).getByRole('textbox', { name: /synopsis/i })).toHaveValue('Dax lays out the Vault job.')
    expect(within(editor).getByRole('textbox', { name: /beat 1/i })).toHaveValue('Something shifts.')
    expect(within(editor).getByRole('textbox', { name: /beat 2/i })).toHaveValue('It cannot shift back.')
    expect(within(editor).getByRole('textbox', { name: /^condition$/i })).toHaveValue('trust >= 1')
    expect(location.hash).toContain('scene=the-job-offer')
  })

  test('the mood board pins images to the scene; removal keeps the asset', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Job Offer' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })

    const file = new File([new Uint8Array([1, 2])], 'brass lamp.png', { type: 'image/png' })
    await userEvent.upload(within(editor).getByLabelText(/add images/i), file)

    await waitFor(async () => {
      expect(await world.files.readText('scenes/the-job-offer.md')).toContain('assets/brass-lamp.png')
    })
    await waitFor(() => expect(within(editor).getByRole('img', { name: 'brass-lamp.png' })).toBeInTheDocument())

    await userEvent.click(within(editor).getByRole('button', { name: 'Remove brass-lamp.png' }))
    await waitFor(async () => {
      expect(await world.files.readText('scenes/the-job-offer.md')).not.toContain('images:')
    })
    expect(await world.files.exists('assets/brass-lamp.png')).toBe(true)
  })

  test('a board image expands over a backdrop, and Escape closes only the lightbox', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Job Offer' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })

    const file = new File([new Uint8Array([1, 2])], 'brass lamp.png', { type: 'image/png' })
    await userEvent.upload(within(editor).getByLabelText(/add images/i), file)
    await userEvent.click(await within(editor).findByRole('button', { name: 'Expand brass-lamp.png' }))

    const lightbox = await screen.findByRole('dialog', { name: 'brass-lamp.png' })
    expect(within(lightbox).getByRole('img', { name: 'brass-lamp.png' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'brass-lamp.png' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: /scene editor/i })).toBeInTheDocument()

    await userEvent.click(within(editor).getByRole('button', { name: 'Expand brass-lamp.png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'brass-lamp.png' })).not.toBeInTheDocument())
  })

  test('a sketched panel saves as SVG and pins to the scene', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Job Offer' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })

    await userEvent.click(within(editor).getByRole('button', { name: /sketch a panel/i }))
    const surface = within(editor).getByLabelText('Drawing surface')
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 20 })
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 80 })
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 80 })
    await userEvent.click(within(editor).getByRole('button', { name: /save panel/i }))

    await waitFor(async () => {
      expect(await world.files.readText('scenes/the-job-offer.md')).toContain('assets/sketch.svg')
    })
    const svg = await world.files.readText('assets/sketch.svg')
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('<path d="M 10 20 L 60 80"')
  })

  test('a pool scene says so instead of naming an act', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Open scene Rooftop Duel' }))
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByText(/idea pool — unplaced/i)).toBeInTheDocument()
  })

  test('Esc closes the editor before it walks the view up', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /open act i — the spark/i }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Job Offer' })[0])
    await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Act I — The Spark' })).toBeInTheDocument()
    expect(location.hash).not.toContain('scene=')
  })

  test('the URL reopens the scene on launch', async () => {
    history.replaceState(null, '', '#view=storylines&scene=embers')
    await openEmbers()
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByRole('textbox', { name: /title/i })).toHaveValue('Ashes or Embers')
  })
})
