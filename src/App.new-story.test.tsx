import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import { InMemoryFileAccess, InMemoryJournal, ManualWatcher } from './adapters/stubs'
import type { OpenedFolder, Platform } from './adapters/types'
import App from './App'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/** A platform whose picker always yields one empty folder. */
function emptyFolderWorld(name: string): { platform: Platform; files: InMemoryFileAccess } {
  const files = new InMemoryFileAccess()
  const folder: OpenedFolder = { name, files, watcher: new ManualWatcher(), journal: new InMemoryJournal() }
  return {
    files,
    platform: {
      pickFolder: async () => folder,
      recents: async () => [],
      openRecent: async () => folder,
      rememberOpened: async () => {},
    },
  }
}

async function startNewStory(name: string) {
  const world = emptyFolderWorld(name)
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByText(/no story\.json/i)
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`start a new story in ${name}`, 'i') }))
  await screen.findByRole('heading', { name })
  return world
}

const manifest = async (files: InMemoryFileAccess) => JSON.parse(await files.readText('story.json'))

describe('starting from an empty folder', () => {
  test('a folder with no story.json offers to start a story there, named after the folder', async () => {
    const world = await startNewStory('Embers')
    expect(await manifest(world.files)).toEqual({ title: 'Embers', acts: [], storylines: [], settings: {} })
  })

  test('a template scaffolds the story instead of a bare manifest', async () => {
    const world = emptyFolderWorld('Fresh')
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByText(/no story\.json/i)
    await userEvent.click(screen.getByRole('button', { name: /begin from three-act/i }))
    await screen.findByRole('heading', { name: 'Fresh' })

    const m = await manifest(world.files)
    expect(m.acts).toHaveLength(3)
    expect(m.storylines).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Act I — Setup' })).toBeInTheDocument()
  })

  test('the Embers structure can be built without touching a file by hand', async () => {
    const world = await startNewStory('Embers')

    const create = async (kind: RegExp, fill: (dialog: HTMLElement) => Promise<void>) => {
      await userEvent.click(screen.getByRole('button', { name: kind }))
      const dialog = screen.getByRole('dialog')
      await fill(dialog)
      await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))
    }
    for (const title of ['Act I — The Spark', 'Act II — The Descent']) {
      await create(/new act/i, async (d) => {
        await userEvent.type(within(d).getByLabelText(/title/i), title)
      })
      await screen.findByRole('button', { name: title })
    }
    for (const name of ['The Heist', "Mara's Trust", 'The Rebellion']) {
      await create(/new storyline/i, async (d) => {
        await userEvent.type(within(d).getByLabelText(/name/i), name)
      })
      await screen.findAllByRole('button', { name: `Edit storyline ${name}` })
    }
    const scene = async (title: string, act: string, lanes: RegExp[]) => {
      await create(/new scene/i, async (d) => {
        await userEvent.type(within(d).getByLabelText(/title/i), title)
        await userEvent.selectOptions(within(d).getByLabelText(/act/i), act)
        for (const lane of lanes) await userEvent.click(within(d).getByRole('checkbox', { name: lane }))
      })
      await screen.findAllByRole('button', { name: `Open scene ${title}` })
    }
    await scene('Cold Open', 'act-i-the-spark', [/the heist/i])
    await scene('The Job Offer', 'act-i-the-spark', [/the heist/i, /mara/i])
    await scene('Pamphlets', 'act-i-the-spark', [/rebellion/i])
    await scene('Ashes or Embers', 'act-ii-the-descent', [/the heist/i])

    // Share the finale with the rebellion from the editor, then reorder a lane by editing the storyline.
    await userEvent.click(screen.getAllByRole('button', { name: 'Open scene Ashes or Embers' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    await userEvent.click(within(editor).getByRole('checkbox', { name: /rebellion/i }))
    expect(await within(editor).findByRole('checkbox', { name: /rebellion/i })).toBeChecked()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit storyline The Rebellion' })[0])
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /move up/i }))
    await within(screen.getByRole('dialog')).findByText(/lane 2 of 3/i)
    await userEvent.keyboard('{Escape}')

    expect(await manifest(world.files)).toMatchObject({
      title: 'Embers',
      acts: [
        { id: 'act-i-the-spark', title: 'Act I — The Spark' },
        { id: 'act-ii-the-descent', title: 'Act II — The Descent' },
      ],
      storylines: [
        { id: 'the-heist', scenes: ['cold-open', 'the-job-offer', 'ashes-or-embers'] },
        { id: 'the-rebellion', scenes: ['pamphlets', 'ashes-or-embers'] },
        { id: 'mara-s-trust', scenes: ['the-job-offer'] },
      ],
    })
    expect(screen.getAllByRole('button', { name: 'Open scene Ashes or Embers' })).toHaveLength(2)
  }, 30_000) // a long walk through nine dialogs; the default 5s is for single interactions
})
