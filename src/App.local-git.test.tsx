import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { InMemoryFileAccess, InMemoryJournal, ManualWatcher } from './adapters/stubs'
import type { OpenedFolder, Platform } from './adapters/types'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
  localStorage.clear()
})

/**
 * GitHub sync is unwired for now: commits go to the folder's own history
 * and nowhere else. Nothing in the app offers a remote, and the token an
 * earlier build kept in this browser's storage is removed at launch.
 */
describe('with sync unwired', () => {
  test('the sidebar has no Sync item and the start screen no pull from GitHub', async () => {
    const empty: OpenedFolder = { name: 'Blank', files: new InMemoryFileAccess(), watcher: new ManualWatcher(), journal: new InMemoryJournal() }
    const platform: Platform = { pickFolder: async () => empty, recents: async () => [], openRecent: async () => empty, rememberOpened: async () => {} }
    const { unmount } = render(<App platform={platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('button', { name: /start a new story in Blank/i })
    expect(screen.queryByRole('button', { name: /github/i })).toBeNull()
    unmount()

    const world = embersWorld()
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    expect(screen.queryByRole('button', { name: /sync/i })).toBeNull()
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
  })

  test('a token left behind by an earlier build is removed at launch', async () => {
    localStorage.setItem('storyline-app:github-token', 'ghp_left_behind')
    const world = embersWorld()
    render(<App platform={world.platform} />)
    await screen.findByRole('button', { name: /open a story folder/i })
    expect(localStorage.getItem('storyline-app:github-token')).toBeNull()
  })
})
