import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { folderGit } from './git/client'
import { embersWorld, type TestWorld } from './test/embers'
import { FakeGitHub } from './test/fakeGitHub'

beforeEach(() => {
  history.replaceState(null, '', '#')
  localStorage.clear()
})

/**
 * Sync in the app: the Sync view saves the remote (owner and repo into
 * story.json, the token into app-local storage only), every boundary
 * commit pushes on its own, and an offline stretch loses nothing — the
 * local history is the queue, and the next sync catches the remote up.
 */

async function openEmbers(remote: FakeGitHub): Promise<TestWorld> {
  const world = embersWorld()
  render(<App platform={world.platform} autosaveDelayMs={20} makeRemote={() => remote} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await waitFor(async () => expect(await folderGit(world.files).log()).toHaveLength(1))
  return world
}

async function configureSync(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /⇅ sync/i }))
  const view = await screen.findByRole('region', { name: /^sync$/i })
  await userEvent.type(within(view).getByRole('textbox', { name: /owner/i }), 'pat')
  await userEvent.type(within(view).getByRole('textbox', { name: /repository/i }), 'story')
  await userEvent.type(within(view).getByLabelText(/token/i), 'ghp_secret')
  await userEvent.click(within(view).getByRole('button', { name: /save & sync/i }))
}

const localHead = async (world: TestWorld) => (await folderGit(world.files).log())[0].id

describe('the sync view', () => {
  test('saves the remote and pushes the story up', async () => {
    const remote = new FakeGitHub()
    const world = await openEmbers(remote)

    await configureSync()

    await waitFor(async () => expect(await remote.head()).toBe(await localHead(world)))
    // Owner and repo travel with the story; the token stays out of the folder.
    expect(await world.files.readText('story.json')).toContain('"owner": "pat"')
    expect(await world.files.readText('story.json')).not.toContain('ghp_secret')
    expect(localStorage.getItem('storyline-app:github-token')).toBe('ghp_secret')

    const view = screen.getByRole('region', { name: /^sync$/i })
    // Two commits by now: the opening sweep, then the settings change.
    expect(await within(view).findByText(/pushed 2 commits/i)).toBeInTheDocument()
  })
})

describe('auto-push', () => {
  test('a boundary commit pushes on its own', async () => {
    const remote = new FakeGitHub()
    const world = await openEmbers(remote)
    await configureSync()
    await waitFor(async () => expect(await remote.head()).not.toBeNull())

    await userEvent.click(screen.getByRole('button', { name: /⌁ storylines/i }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' Pushed too.')
    await userEvent.keyboard('{Escape}')

    await waitFor(async () => expect(await folderGit(world.files).log()).toHaveLength(3))
    await waitFor(async () => expect(await remote.head()).toBe(await localHead(world)))
  })
})

describe('offline', () => {
  test('an offline stretch loses nothing; the next sync catches up', async () => {
    const remote = new FakeGitHub()
    const world = await openEmbers(remote)
    await configureSync()
    await waitFor(async () => expect(await remote.head()).not.toBeNull())
    const before = await remote.head()

    remote.goOffline()
    await userEvent.click(screen.getByRole('button', { name: /⌁ storylines/i }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' Written offline.')
    await userEvent.keyboard('{Escape}')

    // The commit lands locally even though the push cannot.
    await waitFor(async () => expect(await folderGit(world.files).log()).toHaveLength(3))

    remote.goOnline()
    expect(await remote.head()).toBe(before)

    await userEvent.click(screen.getByRole('button', { name: /⇅ sync/i }))
    const view = await screen.findByRole('region', { name: /^sync$/i })
    await userEvent.click(within(view).getByRole('button', { name: /save & sync/i }))
    await waitFor(async () => expect(await remote.head()).toBe(await localHead(world)))
  })
})
