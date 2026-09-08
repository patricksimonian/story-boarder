import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { StubProcessRunner } from './adapters/stubs'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The Coach view's Model section: whether the writer's own Claude Code
 * can be reached, and a ping that proves it. The process runner is the
 * platform's, faked here at the spawn boundary.
 */
async function openCoach(runner?: StubProcessRunner) {
  const world = embersWorld()
  render(<App platform={world.platform} runner={runner} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
  return within(await screen.findByRole('region', { name: /^coach$/i }))
}

describe('the coach', () => {
  test('says which Claude Code it found, and the ping goes out as a one-shot print run and comes back', async () => {
    const runner = new StubProcessRunner({ kind: 'ready', detail: 'Claude Code 2.1.215' })
    runner.answerWith('ping', { echo: 'Embers of the Vault' })
    const view = await openCoach(runner)
    expect(view.getByRole('heading', { name: 'Coach' })).toBeInTheDocument()
    expect(await view.findByText('Claude Code 2.1.215')).toBeInTheDocument()
    expect(view.getByText(/through the Claude Code you are signed into/i)).toBeInTheDocument()

    await userEvent.click(view.getByRole('button', { name: 'Test' }))
    expect(await view.findByText(/Claude answered: “Embers of the Vault”/)).toBeInTheDocument()
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0].argv).toContain('-p')
    expect(runner.calls[0].argv).toContain('--tools')
    expect(runner.calls[0].argv).not.toContain('--bare')
    expect(runner.calls[0].stdin).toBe('Story title: Embers of the Vault')
  })

  test('says why Claude Code cannot be reached, and offers no test until it can', async () => {
    const runner = new StubProcessRunner({ kind: 'unavailable', reason: 'Claude Code not found on PATH' })
    const view = await openCoach(runner)
    expect(await view.findByText('Claude Code not found on PATH')).toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Test' })).toBeDisabled()
  })

  test('a build with no runner says so and offers nothing', async () => {
    const view = await openCoach()
    expect(view.getByText(/no way to reach Claude Code/i)).toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Test' })).toBeDisabled()
  })

  test('a run that fails inside Claude Code reports the reason', async () => {
    const runner = new StubProcessRunner()
    runner.answer('ping', { stdout: JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' }), stderr: '', exitCode: 0 })
    const view = await openCoach(runner)
    await view.findByText('Claude Code 2.1.215')
    await userEvent.click(view.getByRole('button', { name: 'Test' }))
    expect(await view.findByRole('alert')).toHaveTextContent('Not logged in · Please run /login')
  })
})
