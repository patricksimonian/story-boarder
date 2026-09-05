import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/** Embers with one choice: The Job Offer leads to The Dry Cistern when trust allows, and to a scene never written. */
async function branchingWorld() {
  const world = embersWorld()
  const offer = await world.files.readText('scenes/the-job-offer.md')
  await world.files.writeText(
    'scenes/the-job-offer.md',
    offer.replace(
      'condition: trust >= 1\n',
      'condition: trust >= 1\nchoices:\n  - label: Take the job\n    to: the-dry-cistern\n    condition: trust >= 2\n    chance: 70\n  - label: Walk away\n    to: the-long-road\n',
    ),
  )
  return world
}

async function openGraph() {
  const world = await branchingWorld()
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /graph/i }))
  return { world, graph: await screen.findByRole('application', { name: /graph/i }) }
}

describe('the graph view', () => {
  test('shows every scene as a node, pool scenes included, and lives in the URL', async () => {
    const { graph } = await openGraph()
    for (const title of ['Cold Open: Lowmarket', 'The Job Offer', 'Ashes or Embers', 'Rooftop Duel']) {
      expect(await within(graph).findByRole('button', { name: `Open scene ${title}` })).toBeInTheDocument()
    }
    expect(location.hash).toContain('view=graph')
  })

  test('choices are edges carrying their label, condition, and chance', async () => {
    const { graph } = await openGraph()
    expect(await within(graph).findByText('Take the job')).toBeInTheDocument()
    expect(within(graph).getByText('⚑ trust >= 2')).toBeInTheDocument()
    expect(within(graph).getByText('◔ 70%')).toBeInTheDocument()
  })

  test('a choice to a scene that does not exist points at a placeholder', async () => {
    const { graph } = await openGraph()
    expect(await within(graph).findByText('Walk away')).toBeInTheDocument()
    expect(within(graph).getByText(/the-long-road/)).toBeInTheDocument()
    expect(within(graph).getByText(/not written/i)).toBeInTheDocument()
  })

  test('clicking a node opens the editor, and Esc walks back to Storylines', async () => {
    const { graph } = await openGraph()
    // A bare click: user-event's mousedown carries `view: null`, which
    // d3-zoom under the pane dereferences — a jsdom gap, not a browser one.
    fireEvent.click(await within(graph).findByRole('button', { name: 'Open scene The Job Offer' }))
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByRole('textbox', { name: /title/i })).toHaveValue('The Job Offer')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('application', { name: /graph/i })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
    expect(location.hash).toContain('view=storylines')
  })
})
