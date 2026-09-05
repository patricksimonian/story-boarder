import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

// The lesson list and pattern cards were taken out (2026-09-04); the
// door stays open for the model coach specified in ticket 11.
describe('the coach', () => {
  test('the Coach view opens and says what it is waiting on', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const view = within(await screen.findByRole('region', { name: /^coach$/i }))
    expect(view.getByRole('heading', { name: 'Coach' })).toBeInTheDocument()
    expect(view.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
