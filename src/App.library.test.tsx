import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The reference library: characters, places, and lore, explorer-shaped
 * like the notebook but with three fixed folders — the kinds. Pick a
 * kind, and a new entity lands inside it. Pages edit with the same
 * safety rails as notes.
 */

const VAULT = `---
id: the-vault
tags: [underhive]
---

# The Vault

Older than the city above it.
`

async function openLibrary(world: TestWorld): Promise<HTMLElement> {
  render(<App platform={world.platform} autosaveDelayMs={20} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /📇 library/i }))
  return screen.findByRole('region', { name: /^library$/i })
}

describe('the reference library', () => {
  test('entities list under their kind and open onto their page', async () => {
    const world = embersWorld()
    await world.files.writeText('places/the-vault.md', VAULT)
    const view = await openLibrary(world)

    expect(screen.getByRole('button', { name: /📇 library \(2\)/i })).toBeInTheDocument()
    expect(within(view).getByRole('button', { name: 'Shelf Characters' })).toBeInTheDocument()
    expect(within(view).getByRole('button', { name: 'Shelf Places' })).toBeInTheDocument()
    expect(within(view).getByRole('button', { name: 'Shelf Lore' })).toBeInTheDocument()

    await userEvent.click(within(view).getByRole('button', { name: 'Open character Mara' }))
    expect(within(view).getByRole('textbox', { name: /^title$/i })).toHaveValue('Mara')
    expect(within(view).getByText(/the door-woman/i)).toBeInTheDocument()

    await userEvent.click(within(view).getByRole('button', { name: 'Open place The Vault' }))
    expect(within(view).getByRole('textbox', { name: /^title$/i })).toHaveValue('The Vault')
    expect(within(view).getByRole('textbox', { name: /^tags$/i })).toHaveValue('underhive')
  })

  test('a new entity lands on the picked shelf and opens', async () => {
    const world = embersWorld()
    const view = await openLibrary(world)

    await userEvent.click(within(view).getByRole('button', { name: 'Shelf Places' }))
    await userEvent.click(within(view).getByRole('button', { name: 'New place' }))
    const input = within(view).getByRole('textbox', { name: /new place title/i })
    expect(input).toHaveValue('New place')
    expect(input.previousElementSibling).toHaveAccessibleName('Shelf Places')
    await userEvent.keyboard('The Brass Lamp{Enter}')

    await waitFor(async () => {
      const text = await world.files.readText('places/the-brass-lamp.md')
      expect(text).toContain('# The Brass Lamp')
    })
    await waitFor(() => expect(within(view).getByRole('textbox', { name: /^title$/i })).toHaveValue('The Brass Lamp'))
    expect(screen.getByRole('button', { name: /📇 library \(2\)/i })).toBeInTheDocument()
  })

  test('title and tag edits reach the disk after the pause', async () => {
    const world = embersWorld()
    const view = await openLibrary(world)

    await userEvent.click(within(view).getByRole('button', { name: 'Open character Mara' }))
    await userEvent.type(within(view).getByRole('textbox', { name: /^title$/i }), ' the Door-Woman')
    await userEvent.type(within(view).getByRole('textbox', { name: /^tags$/i }), 'crew, safecracker')

    await waitFor(async () => {
      const text = await world.files.readText('characters/mara.md')
      expect(text).toContain('# Mara the Door-Woman')
      expect(text).toContain('tags: [crew, safecracker]')
      expect(text).toContain('The door-woman.')
    })
  })

  test('images land in assets/ and on the mood board; removal keeps the file', async () => {
    const world = embersWorld()
    const view = await openLibrary(world)
    await userEvent.click(within(view).getByRole('button', { name: 'Open character Mara' }))

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'Mara Sketch.png', { type: 'image/png' })
    await userEvent.upload(within(view).getByLabelText(/add images/i), file)

    await waitFor(async () => {
      expect(await world.files.readText('characters/mara.md')).toContain('images: [assets/mara-sketch.png]')
    })
    expect(await world.files.readBinary('assets/mara-sketch.png')).toEqual(new Uint8Array([137, 80, 78, 71]))
    await waitFor(() => expect(within(view).getByRole('img', { name: 'mara-sketch.png' })).toBeInTheDocument())

    await userEvent.click(within(view).getByRole('button', { name: 'Remove mara-sketch.png' }))
    await waitFor(async () => {
      expect(await world.files.readText('characters/mara.md')).not.toContain('images:')
    })
    expect(await world.files.exists('assets/mara-sketch.png')).toBe(true)
  })

  test('deleting a character asks first, removes the file, and leaves scene citations alone', async () => {
    const world = embersWorld()
    await world.files.writeText(
      'scenes/citing.md',
      '---\nid: citing\ncharacters: [mara]\n---\n\n# Citing Scene\n',
    )
    const view = await openLibrary(world)

    await userEvent.click(within(view).getByRole('button', { name: 'Open character Mara' }))
    await userEvent.click(within(view).getByRole('button', { name: /delete character…/i }))
    await userEvent.click(within(view).getByRole('button', { name: /^delete$/i }))

    await waitFor(async () => expect(await world.files.exists('characters/mara.md')).toBe(false))
    expect(await world.files.readText('scenes/citing.md')).toContain('characters: [mara]')
    expect(screen.getByRole('button', { name: /📇 library \(0\)/i })).toBeInTheDocument()
  })
})
