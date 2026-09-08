import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { StubProcessRunner } from './adapters/stubs'
import { memoryLedgerStore } from './assistant/ledger'
import type { ReadSceneOutput } from './assistant/readScene'
import { embersWorld, enableCoaching, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The scene read in the app: a canned read arrives, the ledger holds it,
 * a phrase no name covers lights up, the Coach view logs the development,
 * an alias found in two places is proposed on the page, and a scene
 * that has not changed is never sent twice.
 */

const CISTERN = `---
id: the-dry-cistern
storylines: [mara]
act: act-2
---

# The Dry Cistern

## Synopsis

Mara talks first.

## Beats

1. Something shifts.

## Prose

Mara watched the door out of habit. The door-woman stopped watching it.
`

const EMBERS = `---
id: embers
storylines: [heist, rebellion]
act: act-2
---

# Ashes or Embers

## Synopsis

What the Vault held.

## Beats

1. Something shifts.

## Prose

The door-woman went in first.
`

/** A read that resolves "the door-woman" to Mara wherever it sees it, and records one development in the cistern. */
function readingRunner(): StubProcessRunner {
  const runner = new StubProcessRunner()
  runner.answerWith<ReadSceneOutput>('read-scene', (stdin) => {
    const item = stdin.match(/\((scene:[a-z-]+|note:[a-z-]+)\)/)?.[1]
    const mentions = /door-woman/.test(stdin) ? [{ quote: 'The door-woman', entity: 'character:mara' }] : []
    const developments =
      item === 'scene:the-dry-cistern' ? [{ entity: 'character:mara', fact: 'Mara stops watching the door.', quote: 'The door-woman stopped watching it.' }] : []
    return { mentions, rejected: [], developments }
  })
  return runner
}

async function openStory(world: TestWorld, runner: StubProcessRunner): Promise<void> {
  await enableCoaching(world.files)
  render(<App platform={world.platform} runner={runner} ledgerStore={memoryLedgerStore()} autosaveDelayMs={20} readIdleMs={30} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
}

async function openCistern(): Promise<HTMLElement> {
  await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Dry Cistern' })[0])
  return screen.findByRole('dialog', { name: /scene editor/i })
}

const mentionsIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.mention')]
const readCalls = (runner: StubProcessRunner) => runner.calls.filter((c) => c.workflow === 'read-scene')

describe('the scene read', () => {
  test('the Read button sends the scene, the phrase the read resolved lights up, and an unchanged scene is not sent again', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = readingRunner()
    await openStory(world, runner)
    const editor = await openCistern()
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Mara']))

    const read = await within(editor).findByRole('button', { name: 'Read' })
    await waitFor(() => expect(read).toBeEnabled())
    await userEvent.click(read)
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Mara', 'The door-woman']))
    expect(mentionsIn(editor)[1].className).toContain('mention-model')
    expect(readCalls(runner)).toHaveLength(1)
    expect(readCalls(runner)[0].stdin).toContain('# The item: scene "The Dry Cistern" (scene:the-dry-cistern)')
    expect(readCalls(runner)[0].stdin).toContain('"Mara" → character:mara')

    // The scene says what the read found, right under the button.
    const outcome = within(editor).getByRole('region', { name: 'Last read' })
    expect(outcome).toHaveTextContent('Read just now: 1 development, 1 phrase resolved')
    expect(outcome).toHaveTextContent('Mara Mara stops watching the door.')

    // Hovering the resolved phrase shows what this scene developed about her.
    await userEvent.hover(mentionsIn(editor)[1])
    const tip = await screen.findByRole('dialog', { name: /mention: the door-woman/i })
    expect(tip).toHaveTextContent('Mara stops watching the door.')
    expect(tip).toHaveTextContent('Confirm Mara')

    // Closing the scene saves nothing new, so the idle read finds the same text and stays quiet.
    await userEvent.keyboard('{Escape}')
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(readCalls(runner)).toHaveLength(1)
  })

  test('a save is followed by a read once typing rests, and the Coach view logs what it found', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = readingRunner()
    await openStory(world, runner)
    const editor = await openCistern()
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Read' })).toBeEnabled())
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' Then Rook.')
    // On a loaded machine a pause mid-typing can earn a read of its own;
    // what is claimed is that the finished text was read.
    await waitFor(() => expect(readCalls(runner).some((c) => c.stdin.includes('Mara talks first. Then Rook.'))).toBe(true))

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const coach = within(await screen.findByRole('region', { name: /^coach$/i }))
    expect(await coach.findByRole('heading', { name: 'Mara' })).toBeInTheDocument()
    expect(coach.getByText('Mara stops watching the door.')).toBeInTheDocument()
    await userEvent.click(coach.getByRole('button', { name: 'Open scene The Dry Cistern' }))
    await screen.findByRole('dialog', { name: /scene editor/i })
  })

  test('reading everything goes scene by scene, and a phrase resolved in two places is proposed as an alias', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    await world.files.writeText('scenes/embers.md', EMBERS)
    const runner = readingRunner()
    await openStory(world, runner)
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const coach = within(await screen.findByRole('region', { name: /^coach$/i }))
    const all = coach.getByRole('button', { name: 'Read every changed scene' })
    await waitFor(() => expect(all).toBeEnabled())
    await userEvent.click(all)
    await waitFor(() => expect(readCalls(runner).length).toBeGreaterThanOrEqual(6))
    await waitFor(() => expect(coach.getByRole('button', { name: 'Read every changed scene' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: /📇 library/i }))
    const library = within(await screen.findByRole('region', { name: /^library$/i }))
    await userEvent.click(library.getByRole('button', { name: 'Open character Mara' }))
    const aliases = await library.findByRole('group', { name: /^aliases$/i })
    expect(aliases).toHaveTextContent('The door-woman')
    await userEvent.click(within(aliases).getByRole('button', { name: 'Add alias The door-woman' }))
    await waitFor(async () => expect(await world.files.readText('characters/mara.md')).toContain('aliases: [The door-woman]'))
    expect(within(aliases).queryByRole('button', { name: 'Add alias The door-woman' })).not.toBeInTheDocument()
    expect(within(aliases).getByRole('button', { name: 'Remove alias The door-woman' })).toBeInTheDocument()
  })

  test("the writer's ruling outranks the read's", async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = readingRunner()
    await openStory(world, runner)
    const editor = await openCistern()
    const read = await within(editor).findByRole('button', { name: 'Read' })
    await waitFor(() => expect(read).toBeEnabled())
    await userEvent.click(read)
    await waitFor(() => expect(mentionsIn(editor)).toHaveLength(2))
    await userEvent.hover(mentionsIn(editor)[1])
    await screen.findByRole('dialog', { name: /mention: the door-woman/i })
    await userEvent.click(screen.getByRole('button', { name: 'Not a mention' }))
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Mara']))
    expect(JSON.parse(await world.files.readText('mentions.json'))).toEqual({
      'scene:the-dry-cistern': [{ quote: 'The door-woman', entity: null, by: 'writer' }],
    })
  })

  test('a read that fails says why beside the button', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = new StubProcessRunner()
    runner.answer('read-scene', { stdout: JSON.stringify({ type: 'result', is_error: true, result: 'Rate limited — try again in a minute' }), stderr: '', exitCode: 0 })
    await openStory(world, runner)
    const editor = await openCistern()
    const read = await within(editor).findByRole('button', { name: 'Read' })
    await waitFor(() => expect(read).toBeEnabled())
    await userEvent.click(read)
    expect(await within(editor).findByRole('alert')).toHaveTextContent('Rate limited — try again in a minute')
  })
})
