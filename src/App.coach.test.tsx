import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { StubProcessRunner } from './adapters/stubs'
import { embersWorld, enableCoaching } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The Coach view: off until the switch in Settings is on and the check
 * has passed, then the Developments log and the continuity checks.
 */
async function openCoach(runner?: StubProcessRunner, coaching = false) {
  const world = embersWorld()
  if (coaching) await enableCoaching(world.files)
  render(<App platform={world.platform} runner={runner} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
  return within(await screen.findByRole('region', { name: /^coach$/i }))
}

describe('the coach', () => {
  test('with coaching off it says where the switch is, and offers nothing', async () => {
    const view = await openCoach(new StubProcessRunner())
    expect(view.getByRole('heading', { name: 'Coach' })).toBeInTheDocument()
    expect(view.getByRole('status')).toHaveTextContent('Coaching is off.')
    expect(view.getByRole('button', { name: 'Read every changed scene' })).toBeDisabled()
    expect(view.getByRole('button', { name: 'Check the whole story' })).toBeDisabled()
    await userEvent.click(view.getByRole('button', { name: /turn it on in settings/i }))
    expect(await screen.findByRole('region', { name: /^settings$/i })).toBeInTheDocument()
  })

  test('with coaching on and the check passed, the reads and checks are offered', async () => {
    const view = await openCoach(new StubProcessRunner(), true)
    expect(await view.findByRole('button', { name: 'Read every changed scene' })).toBeEnabled()
    expect(view.getByRole('button', { name: 'Check the whole story' })).toBeEnabled()
    expect(view.queryByRole('status')).not.toBeInTheDocument()
    expect(view.getByText('Nothing read yet.')).toBeInTheDocument()
  })
})
