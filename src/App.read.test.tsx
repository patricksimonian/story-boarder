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

Mara watched the door of the cistern out of habit. The door-woman stopped watching it.
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
    const notes =
      item === 'scene:the-dry-cistern'
        ? [
            { kind: 'define', message: 'The cistern is somewhere the story returns to and has no page.', quote: 'Mara watched the door', name: 'the cistern', defineAs: 'place' },
            {
              kind: 'define',
              message: 'Whether Mara has stopped keeping watch is state a later scene will want.',
              quote: 'The door-woman stopped watching it.',
              name: 'mara_off_guard',
              defineAs: 'variable',
              variable: { id: 'mara_off_guard', type: 'boolean', initial: 'false', description: 'Mara has let her guard down.' },
            },
            { kind: 'loose-end', message: 'Why she watches doors is raised and not answered.', quote: 'out of habit' },
          ]
        : []
    const rejected = item === 'scene:the-dry-cistern' ? [{ quote: 'Maara', candidate: 'character:mara', why: 'a different word here' }] : []
    return { mentions, rejected, developments, notes }
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
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Mara', 'the cistern', 'The door-woman']))
    expect(mentionsIn(editor).find((el) => el.textContent === 'The door-woman')?.className).toContain('mention-model')
    expect(readCalls(runner)).toHaveLength(1)
    expect(readCalls(runner)[0].stdin).toContain('# The item: scene "The Dry Cistern" (scene:the-dry-cistern)')
    expect(readCalls(runner)[0].stdin).toContain('"Mara" → character:mara')

    // The scene says what the read found, right under the button: the notes with their fixes, then the developments.
    const outcome = within(editor).getByRole('region', { name: 'Last read' })
    expect(outcome).toHaveTextContent('Read just now: 3 editor’s notes, 2 things to define, 1 development, 1 phrase resolved')
    expect(within(outcome).queryByRole('list', { name: 'Names ruled out' })).not.toBeInTheDocument()
    expect(outcome).toHaveTextContent('Mara Mara stops watching the door.')
    expect(outcome).toHaveTextContent('Why she watches doors is raised and not answered.')
    expect(outcome).toHaveTextContent('the cistern: mentioned, but no place page describes it.')
    expect(within(outcome).getByRole('button', { name: 'Create a place for the cistern' })).toBeInTheDocument()

    // A thing the read said is missing is drawn in orange; its card creates the page in one click.
    await waitFor(() => expect(mentionsIn(editor).some((el) => el.className.includes('mention-unknown'))).toBe(true))
    const orange = mentionsIn(editor).find((el) => el.className.includes('mention-unknown'))!
    expect(orange).toHaveTextContent('the cistern')
    await userEvent.hover(orange)
    const unknownTip = await screen.findByRole('dialog', { name: /mention: the cistern/i })
    expect(unknownTip).toHaveTextContent('the cistern is mentioned, but nothing in the story describes it. Suggested: a place.')
    await userEvent.click(within(unknownTip).getByRole('button', { name: 'Create place' }))
    await waitFor(async () => expect(await world.files.exists('places/the-cistern.md')).toBe(true))
    await waitFor(() => expect(mentionsIn(editor).find((el) => el.textContent === 'the cistern')?.className).toContain('mention-certain'))

    // Declaring the proposed variable goes through the registry like a typed one.
    await userEvent.click(within(within(editor).getByRole('region', { name: 'Last read' })).getByRole('button', { name: 'Declare mara_off_guard' }))
    await waitFor(async () =>
      expect(JSON.parse(await world.files.readText('variables.json')).variables).toContainEqual({
        id: 'mara_off_guard',
        type: 'boolean',
        initial: false,
        description: 'Mara has let her guard down.',
      }),
    )

    // Hovering the resolved phrase shows what this scene developed about her, and keeps it as her name in one click.
    await userEvent.hover(mentionsIn(editor).find((el) => el.textContent === 'The door-woman')!)
    const tip = await screen.findByRole('dialog', { name: /mention: the door-woman/i })
    expect(tip).toHaveTextContent('Mara stops watching the door.')
    expect(tip).toHaveTextContent('The read took The door-woman to mean Mara.')
    await userEvent.click(within(tip).getByRole('button', { name: 'Keep as a name for Mara' }))
    await waitFor(async () => expect(await world.files.readText('characters/mara.md')).toContain('aliases: [The door-woman]'))
    await waitFor(() => expect(mentionsIn(editor).find((el) => el.textContent === 'The door-woman')?.className).toContain('mention-certain'))

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
    await userEvent.click(coach.getAllByRole('button', { name: 'Open scene The Dry Cistern' })[0])
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
    await waitFor(() => expect(mentionsIn(editor)).toHaveLength(3))
    await userEvent.hover(mentionsIn(editor).find((el) => el.textContent === 'The door-woman')!)
    await screen.findByRole('dialog', { name: /mention: the door-woman/i })
    await userEvent.click(screen.getByRole('button', { name: 'Not a mention' }))
    await waitFor(() => expect(mentionsIn(editor).map((el) => el.textContent)).toEqual(['Mara', 'the cistern']))
    expect(JSON.parse(await world.files.readText('mentions.json'))).toEqual({
      'scene:the-dry-cistern': [{ quote: 'The door-woman', entity: null, by: 'writer' }],
    })
  })

  test('a session limit stops the whole-story pass at once, stands as a notice, and holds reads until dismissed', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = new StubProcessRunner()
    runner.answer('read-scene', {
      stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: "You've hit your session limit · resets 5:30pm (America/Vancouver)" }),
      stderr: '',
      exitCode: 0,
    })
    await openStory(world, runner)
    await userEvent.click(screen.getByRole('button', { name: /🧭 coach/i }))
    const coach = within(await screen.findByRole('region', { name: /^coach$/i }))
    const all = coach.getByRole('button', { name: 'Read every changed scene' })
    await waitFor(() => expect(all).toBeEnabled())
    await userEvent.click(all)
    const notice = await screen.findByRole('status', { name: 'Claude Code limit' })
    expect(notice).toHaveTextContent('Claude Code limit')
    expect(notice).toHaveTextContent("You've hit your session limit · resets 5:30pm (America/Vancouver)")
    await waitFor(() => expect(coach.getByRole('button', { name: 'Read every changed scene' })).toBeDisabled())
    expect(readCalls(runner)).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /storylines/i }))
    const editor = await openCistern()
    expect(within(editor).getByRole('button', { name: 'Read' })).toBeDisabled()
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Read' })).toBeEnabled())
  })

  test('a read shows how long it has run and can be cancelled, which records nothing and says nothing', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = new StubProcessRunner()
    const answerNormally = runner.spawnClaude.bind(runner)
    // The read hangs until it is cancelled; the health check's ping still answers.
    runner.spawnClaude = (argv, stdin, opts) =>
      opts?.workflow === 'read-scene'
        ? new Promise((resolve) => {
            opts.signal?.addEventListener('abort', () => resolve({ stdout: '', stderr: '', exitCode: 143 }))
          })
        : answerNormally(argv, stdin, opts)
    await openStory(world, runner)
    const editor = await openCistern()
    const read = await within(editor).findByRole('button', { name: 'Read' })
    await waitFor(() => expect(read).toBeEnabled())
    await userEvent.click(read)
    const progress = await within(editor).findByRole('status', { name: 'Reading' })
    expect(progress).toHaveTextContent(/\d+s/)
    expect(progress).toHaveTextContent('starting')
    await userEvent.click(within(progress).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Read' })).toBeEnabled())
    expect(within(editor).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(editor).queryByRole('region', { name: 'Last read' })).not.toBeInTheDocument()
  })

  test('a failure belongs to its page, not to every page', async () => {
    const world = embersWorld()
    await world.files.writeText('scenes/the-dry-cistern.md', CISTERN)
    const runner = new StubProcessRunner()
    runner.answer('read-scene', { stdout: '', stderr: 'error: something went wrong', exitCode: 1 })
    await openStory(world, runner)
    const editor = await openCistern()
    const read = await within(editor).findByRole('button', { name: 'Read' })
    await waitFor(() => expect(read).toBeEnabled())
    await userEvent.click(read)
    expect(await within(editor).findByRole('alert')).toHaveTextContent('error: something went wrong')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    const other = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(other).queryByRole('alert')).not.toBeInTheDocument()
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
