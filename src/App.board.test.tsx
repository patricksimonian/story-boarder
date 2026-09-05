import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { embersWorld } from './test/embers'

beforeEach(() => {
  window.location.hash = ''
})

async function openEmbers() {
  const world = embersWorld()
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return world
}

describe('opening a story folder', () => {
  test('the start screen offers the picker', async () => {
    const world = embersWorld()
    render(<App platform={world.platform} />)
    expect(screen.getByRole('button', { name: /open a story folder/i })).toBeInTheDocument()
  })

  test('opening lands on the Storylines board with every lane', async () => {
    await openEmbers()
    const board = screen.getByRole('main')
    expect(within(board).getByText('The Heist')).toBeInTheDocument()
    expect(within(board).getByText("Mara's Trust")).toBeInTheDocument()
    expect(within(board).getByText('The Rebellion')).toBeInTheDocument()
    expect(within(board).getByText('Act I — The Spark')).toBeInTheDocument()
    expect(within(board).getByText('Act II — The Descent')).toBeInTheDocument()
    expect(within(board).getByText('Cold Open: Lowmarket')).toBeInTheDocument()
  })

  test('a shared scene gets a full card in every member lane', async () => {
    await openEmbers()
    expect(screen.getAllByText('The Job Offer')).toHaveLength(2)
    expect(screen.getAllByText('Ashes or Embers')).toHaveLength(2)
  })

  test('the malformed file is flagged, not dropped', async () => {
    await openEmbers()
    expect(screen.getByText(/1 file needs attention/i)).toBeInTheDocument()
  })
})

describe('scrolling the board', () => {
  const wheelDown = () => new WheelEvent('wheel', { deltaY: 120, deltaX: 0, bubbles: true, cancelable: true })

  test('the wheel over the lanes scrolls the page as usual, down through the storylines', async () => {
    await openEmbers()
    const scroller = screen.getByRole('main').querySelector('.b-scroll') as HTMLElement
    const wheel = wheelDown()
    scroller.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(false)
  })

  test('the label column shows it is covering cards only once the board has scrolled', async () => {
    await openEmbers()
    const scroller = screen.getByRole('main').querySelector('.b-scroll') as HTMLElement
    expect(scroller).not.toHaveAttribute('data-scrolled')
    scroller.scrollLeft = 200
    scroller.dispatchEvent(new Event('scroll'))
    expect(scroller).toHaveAttribute('data-scrolled')
    scroller.scrollLeft = 0
    scroller.dispatchEvent(new Event('scroll'))
    expect(scroller).not.toHaveAttribute('data-scrolled')
  })

  test('the wheel over the minimap drives the story sideways instead', async () => {
    await openEmbers()
    const scroller = screen.getByRole('main').querySelector('.b-scroll') as HTMLElement
    const wheel = wheelDown()
    screen.getByTestId('minimap').dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(scroller.scrollLeft).toBe(120)
  })
})
