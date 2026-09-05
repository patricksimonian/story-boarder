import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

/**
 * The never-lose-writing promise, layers one and two: every keystroke is
 * journaled at once, the disk follows about a second after typing pauses,
 * and a relaunch reconciles whatever a crash left in the journal.
 */

const PATH = 'scenes/the-job-offer.md'
const NEVER = 60_000

beforeEach(() => {
  history.replaceState(null, '', '#')
})

async function launch(world: TestWorld, autosaveDelayMs: number) {
  render(<App platform={world.platform} autosaveDelayMs={autosaveDelayMs} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
}

async function openJobOffer(autosaveDelayMs: number, world = embersWorld()) {
  await launch(world, autosaveDelayMs)
  await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Job Offer' })[0])
  const editor = await screen.findByRole('dialog', { name: /scene editor/i })
  return { world, editor, synopsis: within(editor).getByRole('textbox', { name: /synopsis/i }) }
}

/** Kills the app without warning: no cleanup hook gets to write anything. */
function crash() {
  cleanup()
}

async function externalWrite(world: TestWorld, text: string) {
  await world.files.writeText(PATH, text)
  await act(async () => {
    world.watcher.fire([PATH])
  })
}

describe('journal and auto-save', () => {
  test('a keystroke is journaled at once, before anything reaches the disk', async () => {
    const { world, synopsis } = await openJobOffer(NEVER)
    await userEvent.type(synopsis, ' Rook listens.')

    const pending = await world.journal.pending()
    expect(pending.map((e) => e.path)).toEqual([PATH])
    expect(pending[0].text).toContain('Dax lays out the Vault job. Rook listens.')
    expect(await world.files.readText(PATH)).not.toContain('Rook listens.')
  })

  test('the disk follows after the pause, and the journal clears once it has', async () => {
    const { world, synopsis } = await openJobOffer(30)
    await userEvent.type(synopsis, ' Rook listens.')
    await waitFor(async () =>
      expect(await world.files.readText(PATH)).toContain('Dax lays out the Vault job. Rook listens.'),
    )
    await waitFor(async () => expect(await world.journal.pending()).toEqual([]))
  })

  test('opening a scene and closing it untouched writes nothing', async () => {
    const { world } = await openJobOffer(30)
    const before = await world.files.readText(PATH)
    await userEvent.keyboard('{Escape}')
    await new Promise((r) => setTimeout(r, 80))
    expect(await world.files.readText(PATH)).toBe(before)
    expect(await world.journal.pending()).toEqual([])
  })

  test('closing the editor saves right away, not after the pause', async () => {
    const { world, synopsis } = await openJobOffer(NEVER)
    await userEvent.type(synopsis, ' Rook listens.')
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => expect(await world.files.readText(PATH)).toContain('Rook listens.'))
    expect(await world.journal.pending()).toEqual([])
  })

  test('the saved file is the whole scene, beats and prose included', async () => {
    const { world, editor } = await openJobOffer(30)
    await userEvent.type(within(editor).getByRole('textbox', { name: /beat 2/i }), ' Ever.')
    await waitFor(async () =>
      expect(await world.files.readText(PATH)).toContain('2. It cannot shift back. Ever.'),
    )
    const saved = await world.files.readText(PATH)
    expect(saved).toContain('condition: trust >= 1')
    expect(saved).toContain('# The Job Offer')
    expect(saved).toContain('1. Something shifts.')
  })
})

describe('relaunching after a crash', () => {
  test('mid-sentence, the journal is ahead of an untouched disk: nothing is lost', async () => {
    const { world, editor } = await openJobOffer(NEVER)
    const title = within(editor).getByRole('textbox', { name: /title/i })
    await userEvent.type(title, ' — Revised')
    crash()
    expect(await world.files.readText(PATH)).not.toContain('Revised')

    await launch(world, NEVER)
    expect(await screen.findAllByText('The Job Offer — Revised')).not.toHaveLength(0)
    expect(await world.files.readText(PATH)).toContain('# The Job Offer — Revised')
    expect(await world.journal.pending()).toEqual([])
  })

  test('the disk moved while the app was gone: side by side, keep mine', async () => {
    const { world, synopsis } = await openJobOffer(NEVER)
    await userEvent.type(synopsis, ' Rook listens.')
    crash()
    const notepad = (await world.files.readText(PATH)).replace('Dax lays out', 'Dax spells out')
    await world.files.writeText(PATH, notepad)

    render(<App platform={world.platform} autosaveDelayMs={NEVER} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    const dialog = await screen.findByRole('dialog', { name: /changed on disk/i })
    expect(within(dialog).getByText(/Dax spells out/)).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue(/Rook listens\./)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: /keep my version/i }))
    expect(await world.files.readText(PATH)).toContain('Rook listens.')
    expect(await world.journal.pending()).toEqual([])
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
  })

  test('the disk moved while the app was gone: take the disk version', async () => {
    const { world, synopsis } = await openJobOffer(NEVER)
    await userEvent.type(synopsis, ' Rook listens.')
    crash()
    const notepad = (await world.files.readText(PATH)).replace('Dax lays out', 'Dax spells out')
    await world.files.writeText(PATH, notepad)

    render(<App platform={world.platform} autosaveDelayMs={NEVER} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await userEvent.click(await screen.findByRole('button', { name: /take the disk version/i }))
    expect(await world.files.readText(PATH)).toBe(notepad)
    expect(await world.journal.pending()).toEqual([])
    expect(await screen.findByText('Dax spells out the Vault job.')).toBeInTheDocument()
  })
})

describe('the folder stays live under the editor', () => {
  test('the app’s own save echoing back through the watcher is not a conflict', async () => {
    const { world, synopsis } = await openJobOffer(30)
    await userEvent.type(synopsis, ' Rook listens.')
    await waitFor(async () => expect(await world.files.readText(PATH)).toContain('Rook listens.'))
    await act(async () => {
      world.watcher.fire([PATH])
    })
    expect(screen.queryByRole('dialog', { name: /changed on disk/i })).not.toBeInTheDocument()
    expect(synopsis).toHaveValue('Dax lays out the Vault job. Rook listens.')
  })

  test('a disk change under unsaved edits opens the conflict view', async () => {
    const { world, synopsis } = await openJobOffer(NEVER)
    await userEvent.type(synopsis, ' Rook listens.')
    const notepad = (await world.files.readText(PATH)).replace('Dax lays out', 'Dax spells out')
    await externalWrite(world, notepad)
    const dialog = await screen.findByRole('dialog', { name: /changed on disk/i })
    expect(within(dialog).getByText(/Dax spells out/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: /take the disk version/i }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /synopsis/i })).toHaveValue('Dax spells out the Vault job.'),
    )
    expect(await world.journal.pending()).toEqual([])
  })

  test('a clean editor just follows the disk', async () => {
    const { world } = await openJobOffer(NEVER)
    const notepad = (await world.files.readText(PATH)).replace('Dax lays out', 'Dax spells out')
    await externalWrite(world, notepad)
    expect(screen.queryByRole('dialog', { name: /changed on disk/i })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /synopsis/i })).toHaveValue('Dax spells out the Vault job.'),
    )
  })
})
