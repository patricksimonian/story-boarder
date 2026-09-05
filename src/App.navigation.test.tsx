import { render, screen, within } from '@testing-library/react'
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

describe('zoom levels', () => {
  test('Overview shows the acts-by-storylines grid with title-only cards', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /overview/i }))
    const board = screen.getByRole('main')
    expect(within(board).getByText('Cold Open: Lowmarket')).toBeInTheDocument()
    expect(within(board).getByText('The Dry Cistern')).toBeInTheDocument()
    expect(location.hash).toContain('view=overview')
  })

  test('the ⤢ on an act header zooms into that act', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /open act i — the spark/i }))
    const board = screen.getByRole('main')
    expect(within(board).getByRole('heading', { name: 'Act I — The Spark' })).toBeInTheDocument()
    expect(within(board).getByText('Dax lays out the Vault job.')).toBeInTheDocument()
    expect(within(board).queryByText('The Dry Cistern')).not.toBeInTheDocument()
    expect(location.hash).toContain('view=act:act-1')
  })

  test('act view steps between acts with the nav buttons', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /open act i — the spark/i }))
    await userEvent.click(screen.getByRole('button', { name: /act ii ›/i }))
    expect(within(screen.getByRole('main')).getByText('The Dry Cistern')).toBeInTheDocument()
  })

  test('Esc walks up one level', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /open act i — the spark/i }))
    await userEvent.keyboard('{Escape}')
    expect(within(screen.getByRole('main')).getByText('The Heist')).toBeInTheDocument()
    expect(location.hash).toContain('view=storylines')
  })

  test('the URL restores the view on open', async () => {
    history.replaceState(null, '', '#view=act:act-2')
    await openEmbers()
    const board = screen.getByRole('main')
    expect(within(board).getByRole('heading', { name: 'Act II — The Descent' })).toBeInTheDocument()
  })
})
