import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import type { Platform } from './adapters/types'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * ⌂ Home is the way out of an open story: the start screen again, with
 * the story just left at the top of Recent, and nothing typed lost on
 * the way. (The dashboard that grows out of the start screen is ticket 12.)
 */
describe('going home', () => {
  test('leaves the story with its drafts flushed, lists it as recent, and reopens it from there', async () => {
    const world = embersWorld()
    const remembered: string[] = []
    const platform: Platform = {
      ...world.platform,
      recents: async () => remembered,
      rememberOpened: async (folder) => {
        if (!remembered.includes(folder.name)) remembered.unshift(folder.name)
      },
    }
    render(<App platform={platform} autosaveDelayMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })

    // An edit in flight when Home is clicked lands on disk first.
    await userEvent.click(screen.getByText('Cold Open: Lowmarket'))
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' Rain on the cobbles.')

    await userEvent.click(screen.getByRole('button', { name: /⌂ home/i }))
    await screen.findByRole('button', { name: /open a story folder/i })
    expect(screen.queryByRole('heading', { name: 'Embers of the Vault' })).not.toBeInTheDocument()
    expect(location.hash).toBe('')
    await waitFor(async () => {
      expect(await world.files.readText('scenes/cold-open.md')).toContain('Rain on the cobbles.')
    })

    // The story just left is a click away again.
    await userEvent.click(screen.getByRole('button', { name: 'EmbersOfTheVault' }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    expect(screen.getByText('Cold Open: Lowmarket')).toBeInTheDocument()
  })
})
