import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'
import { colorForName } from './ui/storylineColor'

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

describe('creating from the app', () => {
  test('a new scene lands on the board and on disk', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /new scene/i }))

    const dialog = screen.getByRole('dialog', { name: /new scene/i })
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'The Brass Lamp')
    await userEvent.selectOptions(within(dialog).getByLabelText(/act/i), 'act-1')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /the heist/i }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    expect(await screen.findByText('The Brass Lamp')).toBeInTheDocument()
    expect(await world.files.exists('scenes/the-brass-lamp.md')).toBe(true)
    const manifest = JSON.parse(await world.files.readText('story.json'))
    expect(manifest.storylines[0].scenes).toContain('the-brass-lamp')
  })

  test('a new scene with no storyline goes to the pool', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /new scene/i }))
    const dialog = screen.getByRole('dialog', { name: /new scene/i })
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'The False Floor')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    expect(await screen.findByRole('button', { name: /idea pool \(2\)/i })).toBeInTheDocument()
  })

  test('a new act appears in the sidebar and on the board', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /new act/i }))
    const dialog = screen.getByRole('dialog', { name: /new act/i })
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'Act III — The Reckoning')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    expect(await screen.findByRole('button', { name: 'Act III — The Reckoning' })).toBeInTheDocument()
    const manifest = JSON.parse(await world.files.readText('story.json'))
    expect(manifest.acts).toHaveLength(3)
  })

  test('a new storyline gets its lane, glyph picked from the set', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /new storyline/i }))
    const dialog = screen.getByRole('dialog', { name: /new storyline/i })
    await userEvent.type(within(dialog).getByLabelText(/name/i), 'The Warden')
    await userEvent.click(within(dialog).getByRole('radio', { name: '✦' }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    const board = screen.getByRole('main')
    expect(await within(board).findByText('The Warden')).toBeInTheDocument()
    const manifest = JSON.parse(await world.files.readText('story.json'))
    expect(manifest.storylines[3]).toMatchObject({ id: 'the-warden', glyph: '✦', scenes: [] })
    expect(manifest.storylines[3].color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('the color suggestion follows the name until picked by hand', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /new storyline/i }))
    const dialog = screen.getByRole('dialog', { name: /new storyline/i })
    const colorInput = within(dialog).getByLabelText(/color/i)
    const used = ['#5b6ee1', '#d5548e', '#2fa08d']

    await userEvent.type(within(dialog).getByLabelText(/name/i), 'The Warden')
    expect(colorInput).toHaveValue(colorForName('The Warden', used))

    fireEvent.change(colorInput, { target: { value: '#123456' } })
    await userEvent.type(within(dialog).getByLabelText(/name/i), 's Eye')
    expect(colorInput).toHaveValue('#123456')
  })

  test('glyphs already carried by a storyline are greyed out', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /new storyline/i }))
    const dialog = screen.getByRole('dialog', { name: /new storyline/i })
    // ◆ ● ▲ belong to the three existing storylines.
    expect(within(dialog).getByRole('radio', { name: '◆' })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: '●' })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: '▲' })).toBeDisabled()
    // The first free glyph starts selected, so Create needs only a name.
    expect(within(dialog).getByRole('radio', { name: '■' })).toHaveAttribute('aria-checked', 'true')
  })
})
