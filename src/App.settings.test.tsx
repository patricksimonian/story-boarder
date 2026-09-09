import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { StubProcessRunner } from './adapters/stubs'
import { READ_SCENE_RUBRIC } from './assistant/readScene'
import { embersWorld, enableCoaching, type TestWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

/**
 * Settings: the cog at the bottom of the navigation, the story's own
 * settings with the title, and the Claude Code pane — a switch with the
 * health check behind it, the model, the prompts, and a Save that must
 * be pressed before anything lands.
 */

async function openSettings(world: TestWorld, runner?: StubProcessRunner, readIdleMs = 4000) {
  render(<App platform={world.platform} runner={runner} autosaveDelayMs={20} readIdleMs={readIdleMs} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  await userEvent.click(screen.getByRole('button', { name: /⚙ settings/i }))
  return within(await screen.findByRole('region', { name: /^settings$/i }))
}

const manifestOf = async (world: TestWorld) => JSON.parse(await world.files.readText('story.json')) as { title: string; settings: Record<string, unknown> }

describe('the story pane', () => {
  test('the title saves to story.json on Save, the rest of the file untouched; nothing else in it is offered for editing', async () => {
    const world = embersWorld()
    await enableCoaching(world.files)
    const view = await openSettings(world, new StubProcessRunner())
    expect(view.queryByRole('textbox', { name: /json/i })).not.toBeInTheDocument()
    const title = view.getByRole('textbox', { name: 'Story title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Embers, Reborn')
    expect((await manifestOf(world)).title).toBe('Embers of the Vault')
    await userEvent.click(within(view.getByLabelText('Story settings')).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await manifestOf(world)).title).toBe('Embers, Reborn'))
    expect((await manifestOf(world)).settings).toEqual({ assistant: { enabled: true, model: 'haiku', autoRead: true } })
    expect(await screen.findByRole('heading', { name: 'Embers, Reborn' })).toBeInTheDocument()
  })

  test('an empty title cannot be saved, and Cancel puts the title back', async () => {
    const world = embersWorld()
    const view = await openSettings(world, new StubProcessRunner())
    const pane = within(view.getByLabelText('Story settings'))
    await userEvent.clear(pane.getByRole('textbox', { name: 'Story title' }))
    expect(pane.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.click(pane.getByRole('button', { name: 'Cancel' }))
    expect(pane.getByRole('textbox', { name: 'Story title' })).toHaveValue('Embers of the Vault')
    expect(pane.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})

describe('the Claude pane', () => {
  test('switching coaching on runs the check — Checking, then Passed — and Save writes the switch, the model, and the prompt files', async () => {
    const world = embersWorld()
    const runner = new StubProcessRunner()
    const view = await openSettings(world, runner)
    const pane = within(view.getByLabelText('Claude Code settings'))
    expect(pane.queryByRole('status')).not.toBeInTheDocument()
    expect(pane.getByRole('combobox', { name: 'Model' })).toBeDisabled()

    await userEvent.click(pane.getByRole('switch', { name: 'Coaching' }))
    expect(await pane.findByRole('status')).toHaveTextContent(/Passed/)
    expect(pane.getByRole('status')).toHaveTextContent('Claude Code 2.1.215 · signed in as writer@example.com, max plan · haiku answers')
    expect(pane.getByRole('combobox', { name: 'Model' })).toHaveValue('haiku')
    expect((await manifestOf(world)).settings.assistant).toBeUndefined()

    await userEvent.selectOptions(pane.getByRole('combobox', { name: 'Model' }), 'sonnet')
    expect(await pane.findByRole('status')).toHaveTextContent(/sonnet answers/)
    const prompt = pane.getByRole('textbox', { name: 'Read prompt' })
    expect(prompt).toHaveValue(READ_SCENE_RUBRIC)
    await userEvent.clear(prompt)
    await userEvent.paste('Read it my way.')
    await userEvent.click(pane.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await manifestOf(world)).settings.assistant).toEqual({ enabled: true, model: 'sonnet', autoRead: false }))
    expect(await world.files.readText('coach/read-scene.md')).toBe('Read it my way.\n')
    expect(await world.files.exists('coach/check-continuity.md')).toBe(true)
    expect(pane.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(runner.calls.filter((c) => c.workflow === 'ping').every((c) => c.argv.includes('haiku') || c.argv.includes('sonnet'))).toBe(true)
  })

  test('each terse error, and Check again', async () => {
    const world = embersWorld()
    const runner = new StubProcessRunner({ kind: 'unavailable', reason: 'Claude Code not found on PATH' })
    const view = await openSettings(world, runner)
    const pane = within(view.getByLabelText('Claude Code settings'))
    await userEvent.click(pane.getByRole('switch', { name: 'Coaching' }))
    expect(await pane.findByRole('status')).toHaveTextContent('Error — claude code not installed')

    runner.statusValue = { kind: 'ready', detail: 'Claude Code 2.1.215' }
    runner.authValue = { kind: 'signed-out' }
    await userEvent.click(pane.getByRole('button', { name: 'Check again' }))
    expect(await pane.findByRole('status')).toHaveTextContent('Error — claude not logged in')

    runner.authValue = { kind: 'unknown', reason: 'nothing printed' }
    await userEvent.click(pane.getByRole('button', { name: 'Check again' }))
    expect(await pane.findByRole('status')).toHaveTextContent('Error — claude not configured')

    runner.authValue = { kind: 'signed-in' }
    await userEvent.click(pane.getByRole('button', { name: 'Check again' }))
    expect(await pane.findByRole('status')).toHaveTextContent(/Passed/)
  })

  test('reading after a save is its own switch, off until asked for, and a save with it off leaves saves quiet', async () => {
    const world = embersWorld()
    await enableCoaching(world.files, 'haiku', false)
    const runner = new StubProcessRunner()
    const view = await openSettings(world, runner, 30)
    const pane = within(view.getByLabelText('Claude Code settings'))
    await pane.findByRole('status')
    expect(pane.getByRole('switch', { name: 'Read automatically' })).not.toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: /storylines/i }))
    await userEvent.click((await screen.findAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' }))[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByRole('button', { name: 'Read' })).toBeEnabled()
    await userEvent.type(within(editor).getByRole('textbox', { name: /synopsis/i }), ' More.')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(runner.calls.filter((c) => c.workflow === 'read-scene')).toHaveLength(0)

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: /⚙ settings/i }))
    const again = within(within(await screen.findByRole('region', { name: /^settings$/i })).getByLabelText('Claude Code settings'))
    await userEvent.click(again.getByRole('switch', { name: 'Read automatically' }))
    await userEvent.click(again.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await manifestOf(world)).settings.assistant).toEqual({ enabled: true, model: 'haiku', autoRead: true }))
  })

  test('Cancel drops the pane’s edits, and a Reset puts a prompt back', async () => {
    const world = embersWorld()
    const view = await openSettings(world, new StubProcessRunner())
    const pane = within(view.getByLabelText('Claude Code settings'))
    await userEvent.click(pane.getByRole('switch', { name: 'Coaching' }))
    await pane.findByRole('status')
    const prompt = pane.getByRole('textbox', { name: 'Read prompt' })
    await userEvent.clear(prompt)
    await userEvent.paste('Shorter.')
    await userEvent.click(pane.getByRole('button', { name: 'Reset read prompt to default' }))
    expect(prompt).toHaveValue(READ_SCENE_RUBRIC)
    await userEvent.click(pane.getByRole('button', { name: 'Cancel' }))
    expect(pane.getByRole('switch', { name: 'Coaching' })).not.toBeChecked()
    expect((await manifestOf(world)).settings.assistant).toBeUndefined()
  })

  test('a story that opens with coaching on runs the check at once', async () => {
    const world = embersWorld()
    await enableCoaching(world.files, 'opus')
    const runner = new StubProcessRunner()
    const view = await openSettings(world, runner)
    const pane = within(view.getByLabelText('Claude Code settings'))
    expect(await pane.findByRole('status')).toHaveTextContent(/Passed .* opus answers/)
    expect(pane.getByRole('switch', { name: 'Coaching' })).toBeChecked()
    expect(runner.calls.filter((c) => c.workflow === 'ping')).toHaveLength(1)
  })

  test('with coaching off the Read button stays disabled, whatever the runner could do', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} runner={new StubProcessRunner()} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await userEvent.click((await screen.findAllByRole('button', { name: 'Open scene Cold Open: Lowmarket' }))[0])
    const editor = await screen.findByRole('dialog', { name: /scene editor/i })
    expect(within(editor).getByRole('button', { name: 'Read' })).toBeDisabled()
  })

  test('in a browser the pane says how the helper is reached', async () => {
    const world = embersWorld()
    const runner = new StubProcessRunner()
    runner.kind = 'browser'
    const view = await openSettings(world, runner)
    expect(view.getByLabelText('Claude Code settings')).toHaveTextContent(/Make sure it is running/)
  })
})
