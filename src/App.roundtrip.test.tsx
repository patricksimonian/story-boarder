import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import App from './App'
import { InMemoryFileAccess, InMemoryJournal, ManualWatcher } from './adapters/stubs'
import type { OpenedFolder, Platform } from './adapters/types'
import { folderGit } from './git/client'
import { commitAll, log as repoLog } from './git/repo'
import { sync } from './git/sync'
import { embersWorld } from './test/embers'
import { FakeGitHub } from './test/fakeGitHub'

beforeEach(() => {
  history.replaceState(null, '', '#')
  localStorage.clear()
})

/**
 * The stage's done-criterion, walked end to end: machine A pushes Embers
 * up, machine B pulls the whole story into an empty folder, works, and
 * pushes back; A follows; an offline stretch and an overlapping edit end
 * in the side-by-side view, and the resolution reaches both machines.
 */

const IDENT = { name: 'Machine B', email: 'b@example.com' }

async function openStory(): Promise<void> {
  await userEvent.click(screen.getAllByRole('button', { name: /open a story folder/i })[0])
}

async function toBoard(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /⌁ storylines/i }))
}

async function editColdOpen(addition: string): Promise<void> {
  await toBoard()
  await userEvent.click(screen.getAllByRole('button', { name: /Open scene Cold Open/ })[0])
  const editor = await screen.findByRole('dialog', { name: /scene editor/i })
  await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), addition)
  await userEvent.keyboard('{Escape}')
}

test('a two-machine round trip: clone, edits both ways, an offline overlap settled side by side', async () => {
  const remote = new FakeGitHub()

  // --- Machine A: open Embers, configure sync, push. ---
  const a = embersWorld()
  const machineA = render(<App platform={a.platform} autosaveDelayMs={20} makeRemote={() => remote} />)
  await openStory()
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await waitFor(async () => expect(await folderGit(a.files).log()).toHaveLength(1))

  await userEvent.click(screen.getByRole('button', { name: /⇅ sync/i }))
  const syncView = await screen.findByRole('region', { name: /^sync$/i })
  await userEvent.type(within(syncView).getByRole('textbox', { name: /owner/i }), 'pat')
  await userEvent.type(within(syncView).getByRole('textbox', { name: /repository/i }), 'story')
  await userEvent.type(within(syncView).getByLabelText(/token/i), 'ghp_a')
  await userEvent.click(within(syncView).getByRole('button', { name: /save & sync/i }))
  await waitFor(async () => expect(await remote.head()).not.toBeNull())
  machineA.unmount()

  // --- Machine B: another browser, an empty folder, the story pulled down. ---
  localStorage.clear()
  history.replaceState(null, '', '#')
  const bFiles = new InMemoryFileAccess()
  const bFolder: OpenedFolder = {
    name: 'MachineB',
    files: bFiles,
    watcher: new ManualWatcher(),
    journal: new InMemoryJournal(),
  }
  const bPlatform: Platform = {
    pickFolder: async () => bFolder,
    recents: async () => [],
    openRecent: async () => bFolder,
    rememberOpened: async () => {},
  }
  const machineB = render(<App platform={bPlatform} autosaveDelayMs={20} makeRemote={() => remote} />)
  await openStory()

  await userEvent.click(await screen.findByRole('button', { name: /pull a story from github/i }))
  const dialog = await screen.findByRole('dialog', { name: /pull from github/i })
  await userEvent.type(within(dialog).getByRole('textbox', { name: /owner/i }), 'pat')
  await userEvent.type(within(dialog).getByRole('textbox', { name: /repository/i }), 'story')
  await userEvent.type(within(dialog).getByLabelText(/token/i), 'ghp_b')
  await userEvent.click(within(dialog).getByRole('button', { name: /pull story/i }))

  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  expect(await bFiles.readText('scenes/cold-open.md')).toContain('A grain lift goes sideways.')

  // B works; the boundary pushes on its own. The head must actually
  // move — before the edit lands, remote and local agree trivially.
  const beforeEdit = await remote.head()
  await editColdOpen(' Seen from B.')
  await waitFor(async () => {
    const head = await remote.head()
    expect(head).not.toBe(beforeEdit)
    expect(head).toBe((await folderGit(bFiles).log())[0].id)
  })
  machineB.unmount()

  // --- Machine A returns; opening pulls B's work in. ---
  localStorage.setItem('storyline-app:github-token', 'ghp_a')
  history.replaceState(null, '', '#')
  render(<App platform={a.platform} autosaveDelayMs={20} makeRemote={() => remote} />)
  await openStory()
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await waitFor(async () => expect(await a.files.readText('scenes/cold-open.md')).toContain('Seen from B.'))

  // --- The overlap: A rewrites the same synopsis offline; B pushes a different rewrite. ---
  remote.goOffline()
  await editColdOpen(' A insists otherwise.')
  await waitFor(async () => expect((await folderGit(a.files).log())[0].message).toMatch(/^Edit scene: Cold Open/))

  remote.goOnline()
  const bText = await bFiles.readText('scenes/cold-open.md')
  await bFiles.writeText('scenes/cold-open.md', bText.replace('Seen from B.', 'Seen from B. B rewrote it too.'))
  await commitAll(bFiles, 'B rewrites the cold open', IDENT)
  expect((await sync(bFiles, remote, IDENT)).kind).toBe('pushed')

  // A syncs, lands in the side-by-side view, and keeps its own words.
  await userEvent.click(screen.getByRole('button', { name: /⇅ sync/i }))
  const view = await screen.findByRole('region', { name: /^sync$/i })
  await userEvent.click(within(view).getByRole('button', { name: /save & sync/i }))

  const conflict = await screen.findByRole('dialog', { name: /scenes\/cold-open\.md/ })
  expect(within(conflict).getByText(/B rewrote it too\./)).toBeInTheDocument()
  await userEvent.click(within(conflict).getByRole('button', { name: /keep my version/i }))

  // The merge commit records both parents and reaches the remote.
  await waitFor(async () => expect(await remote.head()).toBe((await repoLog(a.files))[0].sha))
  expect((await repoLog(a.files))[0].parents).toHaveLength(2)
  expect(await a.files.readText('scenes/cold-open.md')).toContain('A insists otherwise.')
  expect(await a.files.readText('scenes/cold-open.md')).not.toContain('B rewrote it too.')

  // --- B pulls and holds the resolution: the round trip closes. ---
  expect((await sync(bFiles, remote, IDENT)).kind).toBe('pulled')
  expect(await bFiles.readText('scenes/cold-open.md')).toContain('A insists otherwise.')
  expect(await bFiles.readText('scenes/cold-open.md')).not.toContain('B rewrote it too.')
}, 30000)
