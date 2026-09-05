import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

async function openSearch() {
  const world = embersWorld()
  await world.files.writeText('places/the-vault.md', '---\nid: the-vault\n---\n\n# The Vault\n\nOlder than the city above it.\n')
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /🔎 search/i }))
  return within(await screen.findByRole('region', { name: /^search$/i }))
}

describe('full-text search', () => {
  test('matches list across kinds and a scene hit opens its editor', async () => {
    const view = await openSearch()
    await userEvent.type(view.getByRole('searchbox', { name: /search the story/i }), 'vault')

    expect(view.getByRole('button', { name: 'Open scene The Job Offer' })).toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Open place The Vault' })).toBeInTheDocument()

    await userEvent.click(view.getByRole('button', { name: 'Open scene The Job Offer' }))
    expect(await screen.findByRole('dialog', { name: /scene editor/i })).toBeInTheDocument()
  })

  test('a reference hit opens its library page', async () => {
    const view = await openSearch()
    await userEvent.type(view.getByRole('searchbox', { name: /search the story/i }), 'city above')
    await userEvent.click(view.getByRole('button', { name: 'Open place The Vault' }))

    const library = await screen.findByRole('region', { name: /^library$/i })
    expect(within(library).getByRole('textbox', { name: /^title$/i })).toHaveValue('The Vault')
  })

  test('nothing found says so', async () => {
    const view = await openSearch()
    await userEvent.type(view.getByRole('searchbox', { name: /search the story/i }), 'zeppelin')
    expect(view.getByText(/nothing holds/i)).toBeInTheDocument()
  })
})
