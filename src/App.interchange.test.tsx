import { render, screen, waitFor, within } from '@testing-library/react'
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
 * Interchange in the app: a Twine or Plottr file imports into an empty
 * folder from the start screen (Twine's liftable macros offered as
 * suggestions first), and the sidebar exports a playable HTML into
 * exports/ — which itself re-imports, because every export carries its
 * source.
 */

function emptyWorld(): { files: InMemoryFileAccess; platform: Platform } {
  const files = new InMemoryFileAccess()
  const folder: OpenedFolder = {
    name: 'ImportTarget',
    files,
    watcher: new ManualWatcher(),
    journal: new InMemoryJournal(),
  }
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

const TWEE = `:: StoryTitle
Vault Job

:: StoryData
{"ifid": "6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC", "format": "SugarCube", "start": "Briefing"}

:: Briefing
<<set $trust to 1>>
Dax lays out the job.

[[Take the job->Vault Door]]

:: Vault Door
<<if $trust gte 1>>[[Slip in->Inside]]<</if>>

:: Inside
Gold everywhere.
`

async function importFile(name: string, text: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await userEvent.click(await screen.findByRole('button', { name: /import a twine or plottr file/i }))
  const dialog = await screen.findByRole('dialog', { name: /import a story file/i })
  const input = within(dialog).getByLabelText(/story file to import/i)
  await userEvent.upload(input, new File([text], name, { type: 'text/plain' }))
}

describe('importing Twine', () => {
  test('a SugarCube twee imports; applied suggestions land in the engine', async () => {
    const world = emptyWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await importFile('vault.twee', TWEE)

    const offers = await screen.findByRole('dialog', { name: /lift into the engine/i })
    expect(within(offers).getAllByRole('checkbox')).toHaveLength(2)
    await userEvent.click(within(offers).getByRole('button', { name: /apply/i }))

    await screen.findByRole('heading', { name: 'Vault Job' })
    await waitFor(async () => {
      expect(await world.files.readText('scenes/briefing.md')).toContain('trust = 1')
      expect(await world.files.readText('scenes/vault-door.md')).toContain('condition: trust >= 1')
      expect(await world.files.readText('variables.json')).toContain('"trust"')
    })
    // The macro stays in the prose either way — lifting never rewrites text.
    expect(await world.files.readText('scenes/briefing.md')).toContain('<<set $trust to 1>>')
  })

  test('keeping everything as prose applies nothing', async () => {
    const world = emptyWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await importFile('vault.twee', TWEE)

    const offers = await screen.findByRole('dialog', { name: /lift into the engine/i })
    await userEvent.click(within(offers).getByRole('button', { name: /keep everything as prose/i }))

    await screen.findByRole('heading', { name: 'Vault Job' })
    expect(await world.files.readText('scenes/vault-door.md')).not.toContain('condition:')
    expect(await world.files.exists('variables.json')).toBe(false)
  })
})

describe('importing Plottr', () => {
  test('a .pltr imports structure and prose, no suggestions to offer', async () => {
    const pltr = JSON.stringify({
      file: { version: '2021.6.9' },
      books: { allIds: [1], 1: { id: 1, title: 'Plotted Story' } },
      beats: {
        1: {
          children: { null: [7] },
          heap: { 7: null },
          index: { 7: { id: 7, bookId: 1, position: 0, title: 'auto' } },
        },
      },
      lines: [{ id: 1, bookId: 1, color: '#6cace4', title: 'Main', position: 0 }],
      cards: [
        {
          id: 1,
          lineId: 1,
          beatId: 7,
          positionWithinLine: 0,
          title: 'Opening',
          description: [{ type: 'paragraph', children: [{ text: 'It begins.' }] }],
          tags: [],
          characters: [],
          places: [],
        },
      ],
      characters: [],
      places: [],
      tags: [],
    })
    const world = emptyWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await importFile('plotted.pltr', pltr)

    await screen.findByRole('heading', { name: 'Plotted Story' })
    expect(screen.queryByRole('dialog', { name: /lift into the engine/i })).not.toBeInTheDocument()
    expect(await world.files.readText('scenes/opening.md')).toContain('It begins.')
  })
})

describe('the playable export', () => {
  test('exports into exports/, and the export re-imports losslessly', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} autosaveDelayMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })

    await userEvent.click(screen.getByRole('button', { name: /playable html/i }))
    await screen.findByRole('status')
    expect(screen.getByRole('status')).toHaveTextContent('exports/embers-of-the-vault.html')

    const html = await world.files.readText('exports/embers-of-the-vault.html')
    expect(html).toContain('<title>Embers of the Vault</title>')
    expect(html).toContain('id="story-data"')

    // The same file walks back in through the import door.
    const second = emptyWorld()
    const again = render(<App platform={second.platform} autosaveDelayMs={20} />)
    void again
    // The first app shows its board now, so the only start screen is the second app's.
    await userEvent.click(screen.getByRole('button', { name: /open a story folder/i }))
    await userEvent.click(await screen.findByRole('button', { name: /import a twine or plottr file/i }))
    const dialog = await screen.findByRole('dialog', { name: /import a story file/i })
    await userEvent.upload(
      within(dialog).getByLabelText(/story file to import/i),
      new File([html], 'embers-of-the-vault.html', { type: 'text/html' }),
    )
    await waitFor(async () =>
      expect(await second.files.readText('story.json')).toBe(await world.files.readText('story.json')),
    )
    expect(await second.files.readText('scenes/cold-open.md')).toBe(await world.files.readText('scenes/cold-open.md'))
  })
})
