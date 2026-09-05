import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

async function openEmbers(): Promise<TestWorld> {
  const world = embersWorld()
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return world
}

const FIXED = `---
id: broken
---

# The Mended Scene

## Synopsis

Once broken, now whole.
`

async function externalWrite(world: TestWorld, path: string, text: string) {
  await world.files.writeText(path, text)
  await act(async () => {
    world.watcher.fire([path])
  })
}

describe('the folder is live territory', () => {
  test('an external edit shows up on the board', async () => {
    const world = await openEmbers()
    const edited = (await world.files.readText('scenes/cold-open.md')).replace(
      'Cold Open: Lowmarket',
      'Cold Open: Highmarket',
    )
    await externalWrite(world, 'scenes/cold-open.md', edited)
    expect(await screen.findByText('Cold Open: Highmarket')).toBeInTheDocument()
    expect(screen.queryByText('Cold Open: Lowmarket')).not.toBeInTheDocument()
  })
})

describe('the raw editor for flagged files', () => {
  async function openRawEditor() {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /1 file needs attention/i }))
    await userEvent.click(screen.getByRole('button', { name: /scenes\/broken\.md/i }))
    return { world, textarea: screen.getByRole('textbox', { name: /raw file/i }) }
  }

  test('shows the raw text and saves a fix', async () => {
    const { world, textarea } = await openRawEditor()
    expect(textarea).toHaveValue('this file has no frontmatter')

    fireEvent.change(textarea, { target: { value: FIXED } })
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // The mended scene is loose, so it joins Rooftop Duel in the pool.
    expect(await screen.findByRole('button', { name: /idea pool \(2\)/i })).toBeInTheDocument()
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument()
    expect(await world.files.readText('scenes/broken.md')).toBe(FIXED)
  })

  test('a disk change under unsaved edits opens the conflict view', async () => {
    const { world, textarea } = await openRawEditor()
    fireEvent.change(textarea, { target: { value: 'my unsaved edit' } })
    await externalWrite(world, 'scenes/broken.md', 'the notepad version')

    const dialog = await screen.findByRole('dialog', { name: /changed on disk/i })
    expect(within(dialog).getByText('the notepad version')).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('my unsaved edit')).toBeInTheDocument()
  })

  test('take the disk version: edits are discarded, disk stands', async () => {
    const { world, textarea } = await openRawEditor()
    fireEvent.change(textarea, { target: { value: 'my unsaved edit' } })
    await externalWrite(world, 'scenes/broken.md', 'the notepad version')
    await userEvent.click(await screen.findByRole('button', { name: /take the disk version/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /raw file/i })).toHaveValue('the notepad version')
    expect(await world.files.readText('scenes/broken.md')).toBe('the notepad version')
  })

  test('keep mine: my version is written to disk', async () => {
    const { world, textarea } = await openRawEditor()
    fireEvent.change(textarea, { target: { value: 'my unsaved edit' } })
    await externalWrite(world, 'scenes/broken.md', 'the notepad version')
    await userEvent.click(await screen.findByRole('button', { name: /keep my version/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await world.files.readText('scenes/broken.md')).toBe('my unsaved edit')
  })

  test('a clean raw editor just follows the disk', async () => {
    const { world, textarea } = await openRawEditor()
    await externalWrite(world, 'scenes/broken.md', 'the notepad version')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(textarea).toHaveValue('the notepad version')
  })
})
