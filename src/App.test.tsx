import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'
import type { Platform } from './adapters/types'

const emptyPlatform: Platform = {
  pickFolder: async () => null,
  recents: async () => [],
  openRecent: async () => null,
  rememberOpened: async () => {},
}

test('the shell opens with the app name and no story folder', async () => {
  render(<App platform={emptyPlatform} />)

  expect(screen.getByRole('heading', { name: 'Story Boarder' })).toBeInTheDocument()
  expect(screen.getByText(/no story folder open/i)).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /open a story folder/i })).toBeInTheDocument()
})
