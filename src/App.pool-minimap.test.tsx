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

describe('idea pool drawer', () => {
  test('toggles open with the loose scenes, identical in every view', async () => {
    await openEmbers()
    expect(screen.queryByText('Rooftop Duel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /idea pool \(1\)/i }))
    const drawer = screen.getByRole('complementary', { name: /idea pool/i })
    expect(within(drawer).getByText('Rooftop Duel')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /overview/i }))
    expect(within(screen.getByRole('complementary', { name: /idea pool/i })).getByText('Rooftop Duel')).toBeInTheDocument()
  })

  test('Esc closes the pool before walking up a view level', async () => {
    await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Rooftop Duel')).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('The Heist')).toBeInTheDocument()
  })
})

describe('minimap', () => {
  test('shows a mark per scene placement on the storylines view only', async () => {
    await openEmbers()
    const minimap = screen.getByTestId('minimap')
    // 5 placed scenes; the two shared ones get a mark on each member row: 7 marks.
    expect(minimap.querySelectorAll('.mm-node')).toHaveLength(7)
    expect(minimap.querySelectorAll('.mm-link')).toHaveLength(2)
    expect(within(minimap).getByText('Act I')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /overview/i }))
    expect(screen.queryByTestId('minimap')).not.toBeInTheDocument()
  })
})
