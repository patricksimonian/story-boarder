import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The edit dialogs have lived in the sidebar since stage 3 — and were
 * invisible from the board, which is where a writer actually looks.
 * These pin the board-side doors: a pencil on every act header, and the
 * lane labels themselves.
 */

async function openEmbers(): Promise<HTMLElement> {
  const world = embersWorld()
  render(<App platform={world.platform} autosaveDelayMs={20} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return screen.getByRole('main')
}

describe('editing from the board', () => {
  test('the act header carries a pencil that opens Edit act', async () => {
    const main = await openEmbers()
    await userEvent.click(within(main).getByRole('button', { name: 'Edit act Act I — The Spark' }))
    const dialog = await screen.findByRole('dialog', { name: /edit act/i })

    const title = within(dialog).getByLabelText(/title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Act I — The Ember')
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect(await within(main).findByRole('button', { name: 'Open Act I — The Ember' })).toBeInTheDocument()
  })

  test('the lane label opens Edit storyline', async () => {
    const main = await openEmbers()
    await userEvent.click(within(main).getByRole('button', { name: 'Edit storyline The Heist' }))
    const dialog = await screen.findByRole('dialog', { name: /edit storyline/i })

    const name = within(dialog).getByLabelText(/name/i)
    await userEvent.clear(name)
    await userEvent.type(name, 'The Vault Job')
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect(await within(main).findByRole('button', { name: 'Edit storyline The Vault Job' })).toBeInTheDocument()
  })
})
