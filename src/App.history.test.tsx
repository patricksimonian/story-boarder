import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { folderGit } from './git/client'
import { commitAll, init } from './git/repo'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * Boundary commits: the app commits at natural boundaries — opening a
 * folder (the first commit sweeps everything as it stands), closing or
 * switching a scene, deleting one, and a stretch of idle. The log is
 * read back through the same git client the app itself uses; the story
 * folder's files are the public record either way.
 */

async function openEmbers(idleMs?: number): Promise<TestWorld> {
  const world = embersWorld()
  render(<App platform={world.platform} autosaveDelayMs={20} boundaryIdleMs={idleMs} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return world
}

const logOf = (world: TestWorld) => folderGit(world.files).log()

describe('boundary commits', () => {
  test('opening a folder makes it a repository and commits what stands', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await world.files.exists('.git/HEAD')).toBe(true))
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))
    expect((await logOf(world))[0].message).toMatch(/^New story: Embers of the Vault; /)
  })

  test('closing an edited scene commits it, described', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' It gets worse.')
    await userEvent.keyboard('{Escape}')

    await waitFor(async () => expect(await logOf(world)).toHaveLength(2))
    expect((await logOf(world))[0].message).toBe('Edit scene: Cold Open: Lowmarket — synopsis edited')
  })

  test('switching scenes is a boundary too', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' Then a whistle.')
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene The Job Offer' })[0])

    await waitFor(async () => expect(await logOf(world)).toHaveLength(2))
    expect((await logOf(world))[0].message).toBe('Edit scene: Cold Open: Lowmarket — synopsis edited')
  })

  test('an untouched close commits nothing', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.keyboard('{Escape}')

    // Give any wrongly scheduled commit a beat to land, then look.
    await new Promise((r) => setTimeout(r, 120))
    expect(await logOf(world)).toHaveLength(1)
  })

  test('checkpoints carry the writer’s own words', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    // A structural change nothing has committed yet: a new storyline.
    await userEvent.click(screen.getByRole('button', { name: /\+ new storyline/i }))
    const create = await screen.findByRole('dialog', { name: /new storyline/i })
    await userEvent.type(within(create).getByRole('textbox', { name: /name/i }), 'Sidework')
    await userEvent.click(within(create).getByRole('button', { name: /create/i }))
    await waitFor(async () => expect(await world.files.readText('story.json')).toContain('Sidework'))

    await userEvent.click(screen.getByRole('button', { name: /checkpoint/i }))
    const dialog = await screen.findByRole('dialog', { name: /checkpoint/i })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /message/i }), 'Before the heist rewrite')
    await userEvent.click(within(dialog).getByRole('button', { name: /commit checkpoint/i }))

    await waitFor(async () => expect((await logOf(world))[0]?.message).toBe('Before the heist rewrite'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /checkpoint/i })).not.toBeInTheDocument())
  })

  test('a checkpoint with nothing to commit says so and commits nothing', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /checkpoint/i }))
    const dialog = await screen.findByRole('dialog', { name: /checkpoint/i })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /message/i }), 'Nothing yet')
    await userEvent.click(within(dialog).getByRole('button', { name: /commit checkpoint/i }))

    expect(await within(dialog).findByText(/nothing new since the last commit/i)).toBeInTheDocument()
    expect(await logOf(world)).toHaveLength(1)
  })

  test('the history view lists commits, newest first', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' It gets worse.')
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => expect(await logOf(world)).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: /🕘 history/i }))
    const view = await screen.findByRole('region', { name: /history/i })
    const items = await within(view).findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Edit scene: Cold Open: Lowmarket — synopsis edited')
    expect(items[1]).toHaveTextContent(/^New story: Embers of the Vault/)
  })

  // Building and walking 55 real commits is hundreds of async zlib round
  // trips; on a loaded machine the whole thing crawls. The budget matches
  // the work, so contention slows the test instead of failing it.
  test('the history view pages by fifty, newest first', { timeout: 90000 }, async () => {
    const world = embersWorld()
    await init(world.files)
    for (let i = 0; i < 55; i++) {
      await world.files.writeText('journal.txt', `entry ${i}`)
      await commitAll(world.files, `Entry ${i}`, { name: 'Test Author', email: 't@example.com' }, { time: 1700000000 + i })
    }
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })

    await userEvent.click(screen.getByRole('button', { name: /🕘 history/i }))
    const view = await screen.findByRole('region', { name: /history/i })
    await waitFor(() => expect(within(view).getAllByRole('listitem')).toHaveLength(50), { timeout: 20000 })
    expect(within(view).getByText('Entry 54')).toBeInTheDocument()
    expect(within(view).queryByText('Entry 4')).not.toBeInTheDocument()

    await userEvent.click(within(view).getByRole('button', { name: /show 50 older/i }))
    await waitFor(() => expect(within(view).getAllByRole('listitem')).toHaveLength(55), { timeout: 20000 })
    expect(within(view).getByText('Entry 4')).toBeInTheDocument()
    expect(within(view).queryByRole('button', { name: /show 50 older/i })).not.toBeInTheDocument()
  })

  test('a scene shows its own history and restores a prior version', async () => {
    const world = await openEmbers()
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    let editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' It gets worse.')
    await userEvent.keyboard('{Escape}')
    await waitFor(async () => expect(await logOf(world)).toHaveLength(2))

    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' })[0])
    editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.click(within(editor).getByRole('button', { name: /^history$/i }))

    const entries = await within(editor).findAllByRole('button', { name: /version from/i })
    expect(entries).toHaveLength(2)
    await userEvent.click(entries[1]) // the older version, from the opening sweep
    const preview = await within(editor).findByRole('region', { name: /version preview/i })
    expect(within(preview).getByText(/a grain lift goes sideways\./i)).toBeInTheDocument()

    await userEvent.click(within(editor).getByRole('button', { name: /restore this version/i }))
    await waitFor(async () => {
      const text = await world.files.readText('scenes/cold-open.md')
      expect(text).not.toContain('It gets worse.')
      expect(text).toContain('A grain lift goes sideways.')
    })
    // The editor follows the restored file.
    const synopsis = within(editor).getByRole('textbox', { name: /synopsis/i }) as HTMLTextAreaElement
    await waitFor(() => expect(synopsis.value).not.toContain('It gets worse.'))
  })

  test('a stretch of idle commits pending structural work', async () => {
    const world = await openEmbers(80)
    await waitFor(async () => expect(await logOf(world)).toHaveLength(1))

    // A structural change with no scene editor involved: a new storyline.
    await userEvent.click(screen.getByRole('button', { name: /\+ new storyline/i }))
    const dialog = await screen.findByRole('dialog', { name: /new storyline/i })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /name/i }), 'The Long Con')
    await userEvent.click(within(dialog).getByRole('button', { name: /create/i }))

    await waitFor(async () => expect(await logOf(world)).toHaveLength(2), { timeout: 3000 })
    expect((await logOf(world))[0].message).toBe('New storyline: The Long Con')
  })
})
