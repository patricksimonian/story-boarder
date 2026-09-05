import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { exportPlayable } from '../interchange/export'
import runtimeJs from './runtime.generated.js?raw'

/**
 * The exported file, actually played. The story goes through
 * exportPlayable with the real generated runtime, the islands land in
 * the document the way a browser would hold them, and the runtime boots
 * — no fetch, no eval inside the engine, the same walk the simulator
 * takes. A torch gates a door; lighting it opens the way.
 */

async function torchFolder(): Promise<InMemoryFileAccess> {
  const files = new InMemoryFileAccess()
  await files.writeText(
    'story.json',
    JSON.stringify({
      title: 'Torch Test',
      acts: [],
      storylines: [{ id: 'main', name: 'Main', color: '#5b6ee1', glyph: '◆', scenes: ['dark-door', 'lit', 'vault'] }],
      settings: {},
    }),
  )
  await files.writeText(
    'variables.json',
    JSON.stringify({ variables: [{ id: 'torch', type: 'boolean', initial: false }] }),
  )
  await files.writeText(
    'scenes/dark-door.md',
    `---
id: dark-door
storylines: [main]
choices:
  - label: Light the torch
    to: lit
    effects:
      - torch = true
  - label: Slip through
    to: vault
    condition: torch
---

# The Dark Door

## Prose

A door in the dark.
`,
  )
  await files.writeText(
    'scenes/lit.md',
    `---
id: lit
storylines: [main]
choices:
  - label: Slip through
    to: vault
    condition: torch
---

# Lit

## Prose

Flame catches.
`,
  )
  await files.writeText(
    'scenes/vault.md',
    '---\nid: vault\nstorylines: [main]\n---\n\n# The Vault\n\n## Prose\n\nGold everywhere.\n',
  )
  return files
}

async function bootExport(): Promise<void> {
  const result = await exportPlayable(await torchFolder(), runtimeJs)
  if (!result.ok) throw new Error(result.reason)
  const body = result.html.slice(result.html.indexOf('<body>') + 6, result.html.indexOf('</body>'))
  // innerHTML never executes script elements, so the islands land as
  // data and the runtime is started the way the browser would.
  document.body.innerHTML = body
  new Function(runtimeJs)()
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('the playable export', () => {
  it('boots into the start scene with its choices, gates shut where they should be', async () => {
    await bootExport()
    expect(screen.getByRole('heading', { name: 'Torch Test' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The Dark Door' })).toBeInTheDocument()
    expect(screen.getByText('A door in the dark.')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /light the torch/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /slip through/i })).toBeDisabled()
  })

  it('applies effects on a taken choice and opens what they unlock', async () => {
    await bootExport()
    await userEvent.click(screen.getByRole('button', { name: /light the torch/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lit' })).toBeInTheDocument())
    expect(screen.getByText('Flame catches.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /slip through/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /slip through/i }))
    await waitFor(() => expect(screen.getByText('Gold everywhere.')).toBeInTheDocument())
    expect(screen.getByText('The story rests here.')).toBeInTheDocument()
  })

  it('restarts from the top with fresh state', async () => {
    await bootExport()
    await userEvent.click(screen.getByRole('button', { name: /light the torch/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lit' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /start over/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Dark Door' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /slip through/i })).toBeDisabled()
  })
})
