import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { StubProcessRunner } from './adapters/stubs'
import type { ContinuityOutput } from './assistant/continuity'
import { memoryLedgerStore } from './assistant/ledger'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The continuity check in the app: one call per storyline over the
 * ledger, findings in the Analysis view with both ends linked, counted
 * in the sidebar, dismissed one by one, and gone when the story is left.
 */

function checkingRunner(): StubProcessRunner {
  const runner = new StubProcessRunner()
  runner.answerWith<ContinuityOutput>('check-continuity', (stdin) =>
    /Storyline "The Heist"/.test(stdin)
      ? {
          contradictions: [
            {
              message: 'Rook is out of the city after Cold Open and back at the market in Ashes or Embers.',
              evidence: [
                { scene: 'cold-open', quote: 'Rook gets out.' },
                { scene: 'embers', quote: 'Rook buys bread.' },
              ],
            },
          ],
        }
      : { contradictions: [] },
  )
  return runner
}

async function openStory(world: TestWorld, runner: StubProcessRunner): Promise<void> {
  render(<App platform={world.platform} runner={runner} ledgerStore={memoryLedgerStore()} autosaveDelayMs={20} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
}

const checks = (runner: StubProcessRunner) => runner.calls.filter((c) => c.workflow === 'check-continuity')

describe('the continuity check', () => {
  test('one storyline: the lane goes out in order, the finding lands in Analysis with both ends linked, and dismisses', async () => {
    const world = embersWorld()
    const runner = checkingRunner()
    await openStory(world, runner)
    // The fixture has static findings of its own; the check adds one on top.
    const before = Number(screen.getByRole('button', { name: /✓ analysis \(\d+\)/i }).textContent?.match(/\((\d+)\)/)?.[1])
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const coach = within(await screen.findByRole('region', { name: /^coach$/i }))
    const check = coach.getByRole('button', { name: 'Check The Heist' })
    await waitFor(() => expect(check).toBeEnabled())
    await userEvent.click(check)
    expect(await coach.findByRole('button', { name: /1 finding in Analysis/ })).toBeInTheDocument()
    expect(checks(runner)).toHaveLength(1)
    expect(checks(runner)[0].stdin).toContain('## 1. Cold Open: Lowmarket (cold-open)')
    expect(checks(runner)[0].stdin).toContain('## 3. Ashes or Embers (embers)')
    expect(checks(runner)[0].argv).toContain('opus')
    expect(screen.getByRole('button', { name: new RegExp(`✓ analysis \\(${before + 1}\\)`, 'i') })).toBeInTheDocument()

    await userEvent.click(coach.getByRole('button', { name: /1 finding in Analysis/ }))
    const analysis = within(await screen.findByRole('region', { name: /^analysis$/i }))
    expect(analysis.getByRole('heading', { name: /Continuity/ })).toBeInTheDocument()
    expect(analysis.getByText(/back at the market in Ashes or Embers/)).toBeInTheDocument()
    expect(analysis.getByRole('button', { name: 'Open scene Cold Open: Lowmarket' })).toHaveAttribute('title', 'Rook gets out.')
    await userEvent.click(analysis.getByRole('button', { name: 'Open scene Ashes or Embers' }))
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByRole('textbox', { name: /title/i })).toHaveValue('Ashes or Embers')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(analysis.getByRole('button', { name: /^Dismiss: Rook is out/ }))
    expect(analysis.queryByRole('heading', { name: /Continuity/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(`✓ analysis \\(${before}\\)`, 'i') })).toBeInTheDocument()
  })

  test('the whole story is every storyline in order, one call each', async () => {
    const world = embersWorld()
    const runner = checkingRunner()
    await openStory(world, runner)
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const coach = within(await screen.findByRole('region', { name: /^coach$/i }))
    const all = coach.getByRole('button', { name: 'Check the whole story' })
    await waitFor(() => expect(all).toBeEnabled())
    await userEvent.click(all)
    await waitFor(() => expect(checks(runner)).toHaveLength(3))
    await waitFor(() => expect(coach.getByRole('button', { name: 'Check the whole story' })).toBeEnabled())
    expect(checks(runner).map((c) => c.stdin.match(/Storyline "([^"]+)"/)?.[1])).toEqual(['The Heist', "Mara's Trust", 'The Rebellion'])
    expect(coach.getByRole('button', { name: /1 finding in Analysis/ })).toBeInTheDocument()
  })

  test('a check that fails says why', async () => {
    const world = embersWorld()
    const runner = new StubProcessRunner()
    runner.answer('check-continuity', { stdout: '', stderr: 'error: something went wrong', exitCode: 1 })
    await openStory(world, runner)
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const coach = within(await screen.findByRole('region', { name: /^coach$/i }))
    const check = coach.getByRole('button', { name: 'Check The Heist' })
    await waitFor(() => expect(check).toBeEnabled())
    await userEvent.click(check)
    expect(await coach.findByRole('alert')).toHaveTextContent('error: something went wrong')
  })
})
