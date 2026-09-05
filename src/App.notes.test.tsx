import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * The story's notebook, explorer-shaped: sections are folders you click
 * to select, the two toolbar buttons act on the selection — a new
 * section nests under the highlighted one (or stands at the root with
 * none), a new note lands inside it. Moving a note is a pick from a
 * list, never a rewritable field. On disk nothing moved: sections are
 * frontmatter paths, and explicitly created ones persist in story.json
 * so an empty folder survives a reload.
 */

const NOTE = `---
id: vault-timeline
section: research
---

# Vault Timeline

Three days between the pamphlets and the job offer.
`

async function openNotes(world: TestWorld): Promise<HTMLElement> {
  render(<App platform={world.platform} autosaveDelayMs={20} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /🗒 notes/i }))
  return screen.findByRole('region', { name: /^notes$/i })
}

describe('the notebook', () => {
  test('notes list under their sections and open onto their page', async () => {
    const world = embersWorld()
    await world.files.writeText('notes/vault-timeline.md', NOTE)
    const view = await openNotes(world)

    expect(screen.getByRole('button', { name: /🗒 notes \(1\)/i })).toBeInTheDocument()
    expect(within(view).getByRole('button', { name: 'Section research' })).toBeInTheDocument()
    await userEvent.click(within(view).getByRole('button', { name: 'Open note Vault Timeline' }))

    expect(within(view).getByRole('textbox', { name: /^title$/i })).toHaveValue('Vault Timeline')
    expect(within(view).getByRole('combobox', { name: /^section$/i })).toHaveValue('research')
    expect(within(view).getByText(/three days between the pamphlets/i)).toBeInTheDocument()
  })

  test('a new note appears in place under its folder, name selected for typing over', async () => {
    const world = embersWorld()
    await world.files.writeText('notes/vault-timeline.md', NOTE)
    const view = await openNotes(world)

    await userEvent.click(within(view).getByRole('button', { name: 'Section research' }))
    await userEvent.click(within(view).getByRole('button', { name: /new note/i }))
    const input = within(view).getByRole('textbox', { name: /new note title/i })
    expect(input).toHaveValue('New note')
    expect(input.previousElementSibling).toHaveAccessibleName('Section research')
    await userEvent.keyboard('Faction Sketch{Enter}')

    await waitFor(async () => {
      const text = await world.files.readText('notes/faction-sketch.md')
      expect(text).toContain('# Faction Sketch')
      expect(text).toContain('section: research')
    })
    await waitFor(() => expect(within(view).getByRole('textbox', { name: /^title$/i })).toHaveValue('Faction Sketch'))

    // Deselect: the next note stands at the root.
    await userEvent.click(within(view).getByRole('button', { name: 'Section research' }))
    await userEvent.click(within(view).getByRole('button', { name: /new note/i }))
    expect(within(view).getByRole('textbox', { name: /new note title/i })).toHaveValue('New note')
    await userEvent.keyboard('Loose Thought{Enter}')
    await waitFor(async () => {
      const text = await world.files.readText('notes/loose-thought.md')
      expect(text).toContain('# Loose Thought')
      expect(text).not.toContain('section:')
    })
  })

  test('Escape abandons a new note, and so does leaving the untouched name', async () => {
    const world = embersWorld()
    const view = await openNotes(world)

    await userEvent.click(within(view).getByRole('button', { name: /new note/i }))
    await userEvent.keyboard('{Escape}')
    expect(within(view).queryByRole('textbox', { name: /new note title/i })).not.toBeInTheDocument()

    await userEvent.click(within(view).getByRole('button', { name: /new note/i }))
    await userEvent.click(within(view).getByRole('button', { name: /new section/i }))
    expect(await world.files.exists('notes/new-note.md')).toBe(false)
  })

  test('a new section nests under the selection and persists even while empty', async () => {
    const world = embersWorld()
    await world.files.writeText('notes/vault-timeline.md', NOTE)
    const view = await openNotes(world)

    // Root section, nothing selected.
    await userEvent.click(within(view).getByRole('button', { name: /new section/i }))
    expect(within(view).getByRole('textbox', { name: /new section name/i })).toHaveValue('New section')
    await userEvent.keyboard('people{Enter}')
    await waitFor(async () => expect(await world.files.readText('story.json')).toContain('"people"'))
    expect(await within(view).findByRole('button', { name: 'Section people' })).toBeInTheDocument()

    // A child of the highlighted one, appearing right beneath it.
    await userEvent.click(within(view).getByRole('button', { name: 'Section research' }))
    await userEvent.click(within(view).getByRole('button', { name: /new section/i }))
    const nested = within(view).getByRole('textbox', { name: /new section name/i })
    expect(nested.previousElementSibling).toHaveAccessibleName('Section research')
    await userEvent.keyboard('factions{Enter}')
    await waitFor(async () => expect(await world.files.readText('story.json')).toContain('"research/factions"'))
    expect(await within(view).findByRole('button', { name: 'Section research/factions' })).toBeInTheDocument()

    // A just-created section is the selection — notes go straight inside it.
    await userEvent.click(within(view).getByRole('button', { name: /new note/i }))
    await userEvent.keyboard('The Fullers{Enter}')
    await waitFor(async () =>
      expect(await world.files.readText('notes/the-fullers.md')).toContain('section: research/factions'),
    )
  })

  test('moving a note is a pick from the section list', async () => {
    const world = embersWorld()
    await world.files.writeText('notes/vault-timeline.md', NOTE)
    await world.files.writeText('notes/mara-voice.md', '---\nid: mara-voice\nsection: people\n---\n\n# Mara Voice\n')
    const view = await openNotes(world)
    await userEvent.click(within(view).getByRole('button', { name: 'Open note Vault Timeline' }))

    await userEvent.selectOptions(within(view).getByRole('combobox', { name: /^section$/i }), 'people')
    await waitFor(async () =>
      expect(await world.files.readText('notes/vault-timeline.md')).toContain('section: people'),
    )

    await userEvent.selectOptions(within(view).getByRole('combobox', { name: /^section$/i }), '')
    await waitFor(async () =>
      expect(await world.files.readText('notes/vault-timeline.md')).not.toContain('section:'),
    )
  })

  test('title edits save on the pause', async () => {
    const world = embersWorld()
    await world.files.writeText('notes/vault-timeline.md', NOTE)
    const view = await openNotes(world)
    await userEvent.click(within(view).getByRole('button', { name: 'Open note Vault Timeline' }))

    await userEvent.type(within(view).getByRole('textbox', { name: /^title$/i }), ' v2')
    await waitFor(async () =>
      expect(await world.files.readText('notes/vault-timeline.md')).toContain('# Vault Timeline v2'),
    )
  })

  test('deleting a note asks first, then the file goes', async () => {
    const world = embersWorld()
    await world.files.writeText('notes/vault-timeline.md', NOTE)
    const view = await openNotes(world)
    await userEvent.click(within(view).getByRole('button', { name: 'Open note Vault Timeline' }))

    await userEvent.click(within(view).getByRole('button', { name: /delete note…/i }))
    await userEvent.click(within(view).getByRole('button', { name: /^delete note$/i }))

    await waitFor(async () => expect(await world.files.exists('notes/vault-timeline.md')).toBe(false))
    expect(within(view).queryByRole('button', { name: 'Open note Vault Timeline' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /🗒 notes \(0\)/i })).toBeInTheDocument()
  })
})
