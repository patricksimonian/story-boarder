import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The watcher's echo of the app's own save must never read as an
 * external edit. On a real disk the atomic swap-rename opens two
 * windows the in-memory world doesn't have — a read can fail outright
 * mid-swap, or serve the previous content for a beat — and neither is
 * the writer's problem. Only a read that still disagrees after the dust
 * settles is a real conflict.
 */

const PATH = 'scenes/cold-open.md'

async function openColdOpen(world: TestWorld, autosaveDelayMs = 20): Promise<HTMLElement> {
  render(<App platform={world.platform} autosaveDelayMs={autosaveDelayMs} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
  return screen.findByRole('dialog', { name: /scene editor/i })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 120))

describe('the watcher and the app’s own saves', () => {
  test('a clean echo after a save opens nothing', async () => {
    const world = embersWorld()
    const editor = await openColdOpen(world)
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' More.')
    await waitFor(async () => expect(await world.files.readText(PATH)).toContain('More.'))

    world.watcher.fire([PATH])
    await settle()
    expect(screen.queryByRole('dialog', { name: /changed on disk/i })).not.toBeInTheDocument()
  })

  test('a read that fails mid-swap is not an empty disk', async () => {
    const world = embersWorld()
    const editor = await openColdOpen(world)
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' More.')
    await waitFor(async () => expect(await world.files.readText(PATH)).toContain('More.'))

    // The next read of the scene file throws, the way a swap window can.
    const realRead = world.files.readText.bind(world.files)
    let failures = 1
    world.files.readText = async (path: string) => {
      if (path === PATH && failures > 0) {
        failures--
        throw new Error('mid-swap')
      }
      return realRead(path)
    }

    // Unsaved keystrokes make the draft dirty when the echo lands.
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' And more.')
    world.watcher.fire([PATH])
    await settle()
    expect(screen.queryByRole('dialog', { name: /changed on disk/i })).not.toBeInTheDocument()
  })

  test('a stale read settles on a second look instead of a conflict', async () => {
    const world = embersWorld()
    const stale = await world.files.readText(PATH)
    const editor = await openColdOpen(world)
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' More.')
    await waitFor(async () => expect(await world.files.readText(PATH)).toContain('More.'))

    // One read serves yesterday's bytes, the way a poll racing a rename can.
    const realRead = world.files.readText.bind(world.files)
    let staleReads = 1
    world.files.readText = async (path: string) => {
      if (path === PATH && staleReads > 0) {
        staleReads--
        return stale
      }
      return realRead(path)
    }

    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' And more.')
    world.watcher.fire([PATH])
    await settle()
    expect(screen.queryByRole('dialog', { name: /changed on disk/i })).not.toBeInTheDocument()
  })

  test('a real external edit under unsaved keystrokes still conflicts', async () => {
    // A far-off auto-save, so this pins the judgment, not a race with
    // the flush timer clobbering the external edit first.
    const world = embersWorld()
    const editor = await openColdOpen(world, 600000)

    await world.files.writeText(PATH, '---\nid: cold-open\n---\n\n# Cold Open: Lowmarket\n\n## Synopsis\n\nRewritten in Notepad.\n')
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' And more.')
    world.watcher.fire([PATH])
    expect(await screen.findByRole('dialog', { name: /changed on disk/i })).toBeInTheDocument()
  })
})
