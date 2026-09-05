import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

const PATH = 'scenes/pamphlets.md'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/** Pamphlets carries an effect; the fixture gives it no anchor, so one is added here. */
async function openPamphlets() {
  const world = embersWorld()
  const text = await world.files.readText(PATH)
  await world.files.writeText(PATH, text.replace('effects: [rebellion_strength += 1]', 'effects:\n  - do: rebellion_strength += 1\n    anchor: 2'))
  render(<App platform={world.platform} autosaveDelayMs={30} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: 'Open scene Pamphlets in the Underhive' }))
  const editor = await screen.findByRole('dialog', { name: /scene editor/i })
  return { world, editor }
}

const beats = (editor: HTMLElement) =>
  within(editor)
    .getAllByRole('textbox', { name: /^beat \d+$/i })
    .map((el) => (el as HTMLInputElement).value)

describe('editing beats in the editor', () => {
  test('Enter in a beat starts a new one below it and the effect anchor follows', async () => {
    const { world, editor } = await openPamphlets()
    expect(within(editor).getByRole('combobox', { name: /effect 1 anchor/i })).toHaveValue('2')
    await userEvent.type(within(editor).getByRole('textbox', { name: /beat 1/i }), '{Enter}Someone knocks.')
    expect(beats(editor)).toEqual(['Something shifts.', 'Someone knocks.', 'It cannot shift back.'])
    expect(within(editor).getByRole('combobox', { name: /effect 1 anchor/i })).toHaveValue('3')
    await waitFor(async () => expect(await world.files.readText(PATH)).toContain('2. Someone knocks.'))
    expect(await world.files.readText(PATH)).toContain('anchor: 3')
  })

  test('moving a beat up carries its anchor', async () => {
    const { editor } = await openPamphlets()
    await userEvent.click(within(editor).getByRole('button', { name: /move beat 2 up/i }))
    expect(beats(editor)).toEqual(['It cannot shift back.', 'Something shifts.'])
    expect(within(editor).getByRole('combobox', { name: /effect 1 anchor/i })).toHaveValue('1')
  })

  test('removing the cited beat keeps the effect and drops the citation', async () => {
    const { editor } = await openPamphlets()
    await userEvent.click(within(editor).getByRole('button', { name: /remove beat 2/i }))
    expect(beats(editor)).toEqual(['Something shifts.'])
    expect(within(editor).getByRole('textbox', { name: /^effect 1$/i })).toHaveValue('rebellion_strength += 1')
    expect(within(editor).getByRole('combobox', { name: /effect 1 anchor/i })).toHaveValue('')
  })

  test('Backspace in an empty beat removes it', async () => {
    const { editor } = await openPamphlets()
    await userEvent.click(within(editor).getByRole('button', { name: /\+ beat/i }))
    expect(beats(editor)).toEqual(['Something shifts.', 'It cannot shift back.', ''])
    await userEvent.keyboard('{Backspace}')
    expect(beats(editor)).toEqual(['Something shifts.', 'It cannot shift back.'])
  })
})

describe('prose in the editor', () => {
  test('the file’s prose shows in the prose field and edits save as Markdown', async () => {
    const world = embersWorld()
    await world.files.writeText(
      'scenes/the-dry-cistern.md',
      (await world.files.readText('scenes/the-dry-cistern.md')) + '\n## Prose\n\nMara talks *first*.\n',
    )
    render(<App platform={world.platform} autosaveDelayMs={30} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getByRole('button', { name: 'Open scene The Dry Cistern' }))
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    const prose = within(editor).getByRole('textbox', { name: /prose/i })
    expect(prose).toHaveTextContent('Mara talks first.')
    expect(prose.querySelector('em')).toHaveTextContent('first')

    // jsdom has no caret geometry, so the click lands the cursor at the
    // start of the prose; what matters is that typed text reaches the
    // file as Markdown with the existing emphasis intact.
    await userEvent.click(prose)
    await userEvent.keyboard('Rook waits. ')
    await waitFor(async () =>
      expect(await world.files.readText('scenes/the-dry-cistern.md')).toContain('Rook waits. Mara talks *first*.'),
    )
  })
})
