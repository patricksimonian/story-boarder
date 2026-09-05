import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

async function manifest(world: TestWorld) {
  return JSON.parse(await world.files.readText('story.json'))
}

/** The board's column pitch: 150px card + 10px gap. */
const PITCH = 160

/**
 * jsdom lays nothing out, so a drop zone's left edge reads as 0 and
 * clientX is the offset into the zone: column n is n × PITCH.
 */
async function drag(card: HTMLElement, zone: HTMLElement, clientX: number, init: { ctrlKey?: boolean } = {}) {
  const dataTransfer = { setData: () => {}, getData: () => '', effectAllowed: 'all', dropEffect: 'none' }
  fireEvent.dragStart(card, { dataTransfer })
  fireEvent.dragOver(zone, { clientX, dataTransfer, ...init })
  fireEvent.drop(zone, { clientX, dataTransfer, ...init })
  fireEvent.dragEnd(card, { dataTransfer })
}

const lanes = () => screen.getByRole('main')
const cardIn = (lane: string, title: string) =>
  within(lanes())
    .getAllByRole('button', { name: `Open scene ${title}` })
    .find((el) => el.closest(`[data-lane="${lane}"]`)) as HTMLElement
const zone = (lane: string, act: string) => screen.getByTestId(`drop-${lane}-${act}`)

describe('dragging scenes on the board', () => {
  test('to another lane moves the membership and seats the scene at the drop column', async () => {
    const world = await openEmbers()
    await drag(cardIn('mara', 'The Dry Cistern'), zone('heist', 'act-1'), 0)

    await within(lanes()).findByText('The Dry Cistern', { selector: '[data-lane="heist"] h4' })
    const m = await manifest(world)
    expect(m.storylines[0].scenes).toEqual(['the-dry-cistern', 'cold-open', 'the-job-offer', 'embers'])
    expect(m.storylines[1].scenes).toEqual(['the-job-offer'])
    const file = await world.files.readText('scenes/the-dry-cistern.md')
    expect(file).toContain('- heist')
    expect(file).not.toContain('- mara')
    expect(file).toContain('act: act-1')
  })

  test('with Ctrl held, the scene joins the lane and keeps its old one', async () => {
    const world = await openEmbers()
    await drag(cardIn('mara', 'The Dry Cistern'), zone('heist', 'act-2'), 0, { ctrlKey: true })

    await within(lanes()).findByText('The Dry Cistern', { selector: '[data-lane="heist"] h4' })
    const m = await manifest(world)
    expect(m.storylines[0].scenes).toEqual(['cold-open', 'the-job-offer', 'the-dry-cistern', 'embers'])
    expect(m.storylines[1].scenes).toEqual(['the-job-offer', 'the-dry-cistern'])
  })

  test('within a lane reorders it', async () => {
    const world = await openEmbers()
    // Cold Open sits at column 0, The Job Offer at 1; dropping past The Job Offer's centre puts Cold Open after it.
    await drag(cardIn('heist', 'Cold Open: Lowmarket'), zone('heist', 'act-1'), 2.5 * PITCH)
    await waitFor(async () =>
      expect((await manifest(world)).storylines[0].scenes).toEqual(['the-job-offer', 'cold-open', 'embers']),
    )
  })

  test('to a later act changes the act', async () => {
    const world = await openEmbers()
    await drag(cardIn('heist', 'Cold Open: Lowmarket'), zone('heist', 'act-2'), 3 * PITCH)
    await waitFor(async () => expect(await world.files.readText('scenes/cold-open.md')).toContain('act: act-2'))
    expect((await manifest(world)).storylines[0].scenes).toEqual(['the-job-offer', 'embers', 'cold-open'])
  })

  test('onto the idea pool frees the scene from every storyline', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    await drag(cardIn('mara', 'The Dry Cistern'), screen.getByRole('complementary', { name: /idea pool/i }), 0)

    expect(await screen.findByRole('button', { name: /idea pool \(2\)/i })).toBeInTheDocument()
    expect((await manifest(world)).storylines[1].scenes).toEqual(['the-job-offer'])
  })

  test('from the pool onto a lane places it there', async () => {
    const world = await openEmbers()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    const pool = screen.getByRole('complementary', { name: /idea pool/i })
    await drag(within(pool).getByRole('button', { name: 'Open scene Rooftop Duel' }), zone('rebellion', 'act-2'), 0)

    expect(await screen.findByRole('button', { name: /idea pool \(0\)/i })).toBeInTheDocument()
    expect((await manifest(world)).storylines[2].scenes).toEqual(['pamphlets', 'rooftop-duel', 'embers'])
    expect(await world.files.readText('scenes/rooftop-duel.md')).toContain('act: act-2')
  })
})

/** Embers plus a heist scene that has a lane but no act yet, seated first in the lane. */
async function openEmbersWithUnassigned(): Promise<TestWorld> {
  const world = embersWorld()
  const m = JSON.parse(await world.files.readText('story.json'))
  m.storylines[0].scenes.unshift('a-late-idea')
  await world.files.writeText('story.json', JSON.stringify(m))
  await world.files.writeText(
    'scenes/a-late-idea.md',
    '---\nid: a-late-idea\nstorylines: [heist]\n---\n\n# A Late Idea\n\n## Synopsis\n\nNot placed in time yet.\n',
  )
  render(<App platform={world.platform} />)
  await userEvent.click(await screen.findByRole('button', { name: /open a story folder/i }))
  await screen.findByRole('heading', { name: 'Embers of the Vault' })
  return world
}

describe('a lane scene with no act', () => {
  test('renders in a leading "No act yet" column instead of vanishing', async () => {
    await openEmbersWithUnassigned()
    expect(within(lanes()).getByText('No act yet')).toBeInTheDocument()
    const card = cardIn('heist', 'A Late Idea')
    expect(card).toBeInTheDocument()
    // Column 0 is grid column 2 (the label column comes first); Act I starts after it.
    expect(card.style.gridColumn).toBe('2')
    expect(cardIn('heist', 'Cold Open: Lowmarket').style.gridColumn).toBe('3')
    // No act to open or edit, so the header carries neither button.
    expect(screen.queryByRole('button', { name: /open no act yet/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit act no act yet/i })).not.toBeInTheDocument()
  })

  test('the column is absent while every lane scene has an act', async () => {
    await openEmbers()
    expect(within(lanes()).queryByText('No act yet')).not.toBeInTheDocument()
  })

  test('dropping an act scene into the column keeps its lane and clears its act', async () => {
    const world = await openEmbersWithUnassigned()
    await drag(cardIn('heist', 'Cold Open: Lowmarket'), zone('heist', 'none'), 0)
    await waitFor(async () => expect(await world.files.readText('scenes/cold-open.md')).not.toContain('act:'))
    expect((await manifest(world)).storylines[0].scenes).toEqual(['cold-open', 'a-late-idea', 'the-job-offer', 'embers'])
  })

  test('dropping a pool scene into the column joins the lane without an act', async () => {
    const world = await openEmbersWithUnassigned()
    await userEvent.click(screen.getByRole('button', { name: /idea pool/i }))
    const pool = screen.getByRole('complementary', { name: /idea pool/i })
    await drag(within(pool).getByRole('button', { name: 'Open scene Rooftop Duel' }), zone('rebellion', 'none'), 0)
    await waitFor(async () => expect((await manifest(world)).storylines[2].scenes).toEqual(['rooftop-duel', 'pamphlets', 'embers']))
    expect(await world.files.readText('scenes/rooftop-duel.md')).not.toContain('act:')
    expect(await world.files.readText('scenes/rooftop-duel.md')).toContain('- rebellion')
  })

  test('the Overview grid shows the same column', async () => {
    await openEmbersWithUnassigned()
    await userEvent.click(screen.getByRole('button', { name: /overview/i }))
    expect(await screen.findByText('No act yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open scene A Late Idea' })).toBeInTheDocument()
  })
})
