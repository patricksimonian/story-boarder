import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  history.replaceState(null, '', '#')
})

describe('goals and writing stats', () => {
  test('the stats view counts prose and a goal shows progress and persists', async () => {
    const world = embersWorld()
    await world.files.writeText(
      'scenes/written.md',
      '---\nid: written\n---\n\n# Written\n\n## Prose\n\nSeven words of actual prose right here.\n',
    )
    render(<App platform={world.platform} />)
    await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
    await screen.findByRole('heading', { name: 'Embers of the Vault' })
    await userEvent.click(screen.getByRole('button', { name: /🎯 stats/i }))
    const view = within(await screen.findByRole('region', { name: /^stats$/i }))

    expect(view.getByText(/7 words/i)).toBeInTheDocument()
    expect(view.getByText(/written/i)).toBeInTheDocument()

    await userEvent.type(view.getByRole('spinbutton', { name: /word goal/i }), '100')
    await userEvent.tab()
    await waitFor(() => expect(view.getByText(/7 of 100/i)).toBeInTheDocument())
    const manifest = JSON.parse(await world.files.readText('story.json'))
    expect(manifest.settings.goals).toEqual({ storyWords: 100 })
  })
})
