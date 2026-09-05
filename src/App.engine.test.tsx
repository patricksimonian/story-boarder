import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { branchingWorld, type BranchingWorld } from './test/branching'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

async function openVault(): Promise<BranchingWorld> {
  const world = branchingWorld()
  render(<App platform={world.platform} autosaveDelayMs={20} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'The Vault' })
  return world
}

async function openEditor(title: string) {
  await userEvent.click(screen.getAllByRole('button', { name: `Open scene ${title}` })[0])
  return screen.findByRole('dialog', { name: /scene editor/i })
}

describe('editing the engine fields on a scene', () => {
  test('a condition is typed in, checked live, and saved', async () => {
    const world = await openVault()
    const editor = await openEditor('Ashes or Embers')
    const condition = within(editor).getByRole('textbox', { name: /^condition$/i })
    await userEvent.type(condition, 'trusst >= 1')
    expect(within(editor).getByText('`trusst` is not a registered variable')).toBeInTheDocument()
    await userEvent.clear(condition)
    await userEvent.type(condition, 'trust >= 1')
    expect(within(editor).queryByText(/not a registered variable/)).not.toBeInTheDocument()
    await waitFor(async () => expect(await world.files.readText('scenes/ending.md')).toContain('condition: trust >= 1'))
  })

  test('effects are a list with beat anchors; chance is a number', async () => {
    const world = await openVault()
    const editor = await openEditor('Ashes or Embers')
    await userEvent.click(within(editor).getByRole('button', { name: /\+ effect/i }))
    await userEvent.type(within(editor).getByRole('textbox', { name: /^effect 1$/i }), 'trust += 1')
    await userEvent.selectOptions(within(editor).getByRole('combobox', { name: /effect 1 anchor/i }), '1')
    await userEvent.type(within(editor).getByRole('spinbutton', { name: /^chance$/i }), '40')
    await waitFor(async () => {
      const file = await world.files.readText('scenes/ending.md')
      expect(file).toContain('do: trust += 1')
      expect(file).toContain('anchor: 1')
      expect(file).toContain('chance: 40')
    })
  })

  test('a choice names a label and a target scene, and can carry a gate and effects', async () => {
    const world = await openVault()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    const editor = await openEditor('Walking Away')
    await userEvent.click(within(editor).getByRole('button', { name: /\+ choice/i }))
    await userEvent.type(within(editor).getByRole('textbox', { name: /choice 1 label/i }), 'Come back')
    await userEvent.selectOptions(within(editor).getByRole('combobox', { name: /choice 1 leads to/i }), 'offer')
    await userEvent.type(within(editor).getByRole('textbox', { name: /choice 1 condition/i }), 'trust >= 1')
    await userEvent.type(within(editor).getByRole('textbox', { name: /choice 1 effects/i }), 'trust -= 1, mara_alive = false')
    await waitFor(async () => {
      const file = await world.files.readText('scenes/refusal.md')
      expect(file).toContain('label: Come back')
      expect(file).toContain('to: offer')
      expect(file).toContain('condition: trust >= 1')
      expect(file).toContain('- trust -= 1')
      expect(file).toContain('- mara_alive = false')
    })
    await userEvent.click(within(editor).getByRole('button', { name: /remove choice 1/i }))
    await waitFor(async () => expect(await world.files.readText('scenes/refusal.md')).not.toContain('choices'))
  })
})

describe('the variables view', () => {
  test('declares a new variable and drops an unused one', async () => {
    const world = await openVault()
    await userEvent.click(screen.getByRole('button', { name: /variables \(6\)/i }))
    const view = await screen.findByRole('region', { name: /variables/i })
    await userEvent.type(within(view).getByRole('textbox', { name: /new variable id/i }), 'visited_chapel')
    await userEvent.selectOptions(within(view).getByRole('combobox', { name: /new variable type/i }), 'boolean')
    await userEvent.click(within(view).getByRole('button', { name: /^add variable$/i }))
    await screen.findByRole('button', { name: /variables \(7\)/i })
    let registry = JSON.parse(await world.files.readText('variables.json'))
    expect(registry.variables).toContainEqual({ id: 'visited_chapel', type: 'boolean', initial: false })

    await userEvent.click(within(view).getByRole('button', { name: /delete variable unused/i }))
    await screen.findByRole('button', { name: /variables \(6\)/i })
    registry = JSON.parse(await world.files.readText('variables.json'))
    expect(registry.variables.some((v: { id: string }) => v.id === 'unused')).toBe(false)
  })

  test('the ledger shows where each variable is set and read, and a site opens its scene', async () => {
    await openVault()
    await userEvent.click(screen.getByRole('button', { name: /variables \(6\)/i }))
    const view = await screen.findByRole('region', { name: /variables/i })

    const trust = within(view).getByRole('group', { name: 'Ledger for trust' })
    expect(within(trust).getByText(/set by/i)).toBeInTheDocument()
    expect(within(trust).getByRole('button', { name: 'The Offer — effect `trust += 1`' })).toBeInTheDocument()
    expect(
      within(trust).getByRole('button', { name: 'The Vault Door — choice "Trust Mara" gate `trust >= 1`' }),
    ).toBeInTheDocument()

    // A half nobody wrote is said plainly.
    const unused = within(view).getByRole('group', { name: 'Ledger for unused' })
    expect(within(unused).getByText(/no effect sets it/i)).toBeInTheDocument()
    expect(within(unused).getByText(/no condition reads it/i)).toBeInTheDocument()

    // A site is a door to its scene.
    await userEvent.click(within(trust).getByRole('button', { name: 'The Offer — effect `trust += 1`' }))
    expect(await screen.findByRole('dialog', { name: /scene editor/i })).toBeInTheDocument()
  })

  test('a variable description is written in the table and lands in variables.json', async () => {
    const world = await openVault()
    await userEvent.click(screen.getByRole('button', { name: /variables \(6\)/i }))
    const view = await screen.findByRole('region', { name: /variables/i })

    await userEvent.type(
      within(view).getByRole('textbox', { name: 'trust description' }),
      'How far Mara and Rook have come.',
    )
    await userEvent.tab()
    await waitFor(async () => {
      const registry = JSON.parse(await world.files.readText('variables.json'))
      expect(registry.variables.find((v: { id: string }) => v.id === 'trust').description).toBe(
        'How far Mara and Rook have come.',
      )
    })
  })

  test('an enum lists its values and an initial value can be changed', async () => {
    const world = await openVault()
    await userEvent.click(screen.getByRole('button', { name: /variables/i }))
    const view = await screen.findByRole('region', { name: /variables/i })
    await userEvent.selectOptions(within(view).getByRole('combobox', { name: /city_mood initial/i }), 'tense')
    await waitFor(async () => {
      const registry = JSON.parse(await world.files.readText('variables.json'))
      expect(registry.variables.find((v: { id: string }) => v.id === 'city_mood').initial).toBe('tense')
    })
  })
})

describe('the simulator', () => {
  test('walks the story with live state, and saves the walk as a playthrough', async () => {
    const world = await openVault()
    await userEvent.click(screen.getByRole('button', { name: /simulate/i }))
    const sim = await screen.findByRole('region', { name: /simulat/i })
    expect(within(sim).getByRole('heading', { name: 'The Offer' })).toBeInTheDocument()
    expect(within(sim).getByRole('cell', { name: 'trust' }).nextElementSibling).toHaveTextContent('1')
    expect(within(sim).getByRole('button', { name: /refuse/i })).toBeDisabled()
    expect(within(sim).getByText(/needs city_mood == rioting/)).toBeInTheDocument()

    await userEvent.click(within(sim).getByRole('button', { name: 'Take the job' }))
    expect(within(sim).getByRole('heading', { name: 'The Vault Door' })).toBeInTheDocument()
    await userEvent.click(within(sim).getByRole('button', { name: 'Trust Mara' }))
    expect(within(sim).getByRole('heading', { name: 'Ashes or Embers' })).toBeInTheDocument()
    expect(within(sim).getByRole('cell', { name: 'trust' }).nextElementSibling).toHaveTextContent('2')
    expect(within(sim).getByRole('button', { name: /a whisper/i })).toBeEnabled()

    await userEvent.type(within(sim).getByRole('textbox', { name: /playthrough name/i }), 'Trusting Mara')
    await userEvent.click(within(sim).getByRole('button', { name: /save playthrough/i }))
    await waitFor(async () => expect(await world.files.exists('playthroughs/trusting-mara.json')).toBe(true))
    const saved = JSON.parse(await world.files.readText('playthroughs/trusting-mara.json'))
    expect(saved.steps.map((s: { scene: string }) => s.scene)).toEqual(['offer', 'door', 'ending'])
    expect(await within(sim).findByRole('button', { name: /replay trusting mara/i })).toBeInTheDocument()
  })

  test('replaying a saved playthrough reports whether the story still supports it', async () => {
    const world = branchingWorld()
    await world.files.writeText(
      'playthroughs/sealed.json',
      JSON.stringify({
        name: 'Sealed',
        steps: [
          { scene: 'offer', state: { trust: 1 } },
          { scene: 'door', choice: 'Take the job', state: { trust: 1 } },
          { scene: 'ending', choice: 'Seal it', state: { trust: 0, mara_alive: false } },
        ],
      }),
    )
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'The Vault' })
    await userEvent.click(screen.getByRole('button', { name: /simulate/i }))
    const sim = await screen.findByRole('region', { name: /simulat/i })
    await userEvent.click(within(sim).getByRole('button', { name: /replay sealed/i }))
    expect(within(sim).getByText(/still holds/i)).toBeInTheDocument()
    expect(within(sim).getByRole('heading', { name: 'Ashes or Embers' })).toBeInTheDocument()
  })
})

describe('the analysis view', () => {
  test('lists the findings and opens the scene behind one', async () => {
    await openVault()
    await userEvent.click(screen.getByRole('button', { name: /analysis \(\d+\)/i }))
    const view = await screen.findByRole('region', { name: /analysis/i })
    expect(within(view).getByText(/Choice "Refuse" can never be taken/)).toBeInTheDocument()
    expect(within(view).getByText(/`unused` is never set and never read/)).toBeInTheDocument()
    await userEvent.click(within(view).getAllByRole('button', { name: 'Open scene The Offer' })[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByRole('textbox', { name: /title/i })).toHaveValue('The Offer')
  })
})
