import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

describe('the coach', () => {
  test('lessons check themselves against the story, with evidence or directions', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const view = within(await screen.findByRole('region', { name: /^coach$/i }))

    // Embers declares `trust` and reads it, but nothing writes it.
    const declare = view.getByRole('listitem', { name: 'Declare a variable — done' })
    expect(within(declare).getByText(/`trust` is declared/)).toBeInTheDocument()
    const loop = view.getByRole('listitem', { name: 'Close a loop — to do' })
    expect(within(loop).getByText(/ledger in the Variables view/i)).toBeInTheDocument()

    // The pattern cards ride below.
    expect(view.getByText('The counter and the gate')).toBeInTheDocument()
    expect(view.getByText('Time as an enum')).toBeInTheDocument()
  })
})
