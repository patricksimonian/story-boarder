import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { InMemoryFileAccess, InMemoryJournal, ManualWatcher } from './adapters/stubs'
import type { OpenedFolder, Platform } from './adapters/types'
import App from './App'
import { embersFiles } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

function folderOf(files: InMemoryFileAccess, name: string): OpenedFolder {
  return { name, files, watcher: new ManualWatcher(), journal: new InMemoryJournal() }
}

/** A platform whose picker yields each result in turn: folders, nulls, or errors. */
function pickerSequence(...results: (OpenedFolder | null | Error)[]): Platform & {
  remembered: string[]
} {
  let at = 0
  const remembered: string[] = []
  return {
    remembered,
    pickFolder: async () => {
      const result = results[Math.min(at++, results.length - 1)]
      if (result instanceof Error) throw result
      return result
    },
    recents: async () => [],
    openRecent: async () => null,
    rememberOpened: async (folder) => {
      remembered.push(folder.name)
    },
  }
}

const pickButton = () => screen.findByRole('button', { name: /open a story folder/i })

describe('retrying after a failed open', () => {
  test('a folder without story.json errors, and the next pick still works', async () => {
    const bad = new InMemoryFileAccess()
    await bad.writeText('notes.txt', 'not a story folder')
    const platform = pickerSequence(folderOf(bad, 'NotAStory'), folderOf(embersFiles(), 'Embers'))
    render(<App platform={platform} />)

    await userEvent.click(await pickButton())
    expect(await screen.findByText(/no story\.json/i)).toBeInTheDocument()

    await userEvent.click(await pickButton())
    expect(await screen.findByRole('heading', { name: 'Embers of the Vault' })).toBeInTheDocument()
  })

  test('a picker failure surfaces its message instead of doing nothing', async () => {
    const platform = pickerSequence(
      new Error('File picker refused to open'),
      folderOf(embersFiles(), 'Embers'),
    )
    render(<App platform={platform} />)

    await userEvent.click(await pickButton())
    expect(await screen.findByText(/file picker refused to open/i)).toBeInTheDocument()

    await userEvent.click(await pickButton())
    expect(await screen.findByRole('heading', { name: 'Embers of the Vault' })).toBeInTheDocument()
  })

  test('only a folder that actually opened lands in recents', async () => {
    const bad = new InMemoryFileAccess()
    const platform = pickerSequence(folderOf(bad, 'NotAStory'), folderOf(embersFiles(), 'Embers'))
    render(<App platform={platform} />)

    await userEvent.click(await pickButton())
    await screen.findByText(/no story\.json/i)
    expect(platform.remembered).toEqual([])

    await userEvent.click(await pickButton())
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    expect(platform.remembered).toEqual(['Embers'])
  })

  test('a failed recent reopen explains itself', async () => {
    const platform: Platform = {
      pickFolder: async () => null,
      recents: async () => ['MovedStory'],
      openRecent: async () => {
        throw new Error('Permission to MovedStory was not granted')
      },
      rememberOpened: async () => {},
    }
    render(<App platform={platform} />)

    await userEvent.click(await screen.findByRole('button', { name: 'MovedStory' }))
    expect(await screen.findByText(/permission to movedstory/i)).toBeInTheDocument()
  })

  test('dismissing the picker changes nothing', async () => {
    const platform = pickerSequence(null)
    const spy = vi.spyOn(console, 'error')
    render(<App platform={platform} />)
    await userEvent.click(await pickButton())
    expect(screen.getByText(/no story folder open/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})
