import { describe, expect, test } from 'vitest'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { briefContinuity, continuityRequest, CONTINUITY_RUBRIC, findingsFrom, walkStoryline } from './continuity'
import type { Ledger } from './ledger'

async function story() {
  const files = embersFiles()
  await files.writeText(
    'scenes/cold-open.md',
    '---\nid: cold-open\nstorylines: [heist]\nact: act-1\neffects: [trust += 2]\n---\n\n# Cold Open: Lowmarket\n\n## Synopsis\n\nA grain lift goes sideways.\n',
  )
  await files.writeText('variables.json', JSON.stringify({ variables: [{ id: 'trust', type: 'number', initial: 0, description: 'How far Mara trusts Rook.' }] }))
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded.story
}

const entry = (developments: { entity: string; fact: string; quote: string }[]) => ({ hash: 'h', readAt: 1, mentions: [], rejected: [], developments })

describe('the continuity briefing', () => {
  test('walks the lane in order with the state the engine holds on entering each scene, gates and all', async () => {
    const steps = walkStoryline(await story(), 'heist')
    expect(steps.map((s) => [s.scene, s.state.trust, s.gated])).toEqual([
      ['cold-open', 2, undefined],
      ['the-job-offer', 2, 'trust >= 1'],
      ['embers', 2, undefined],
    ])
    expect(walkStoryline(await story(), 'nope')).toEqual([])
  })

  test('carries each scene in order with its state, its developments quoted, or that it is unread', async () => {
    const s = await story()
    const ledger: Ledger = {
      'scene:cold-open': entry([{ entity: 'character:rook', fact: 'Rook has the ledger scrap.', quote: 'Rook gets out with the ledger scrap.' }]),
      'scene:embers': entry([]),
    }
    const briefing = briefContinuity(s, 'heist', ledger)!
    expect(briefing).toContain('# Storyline "The Heist" (heist), in order')
    expect(briefing).toContain('## 1. Cold Open: Lowmarket (cold-open)\nState on entering: trust = 2\n- character:rook: Rook has the ledger scrap. — "Rook gets out with the ledger scrap."')
    expect(briefing).toContain('## 2. The Job Offer (the-job-offer)\nState on entering: trust = 2\nGated by: trust >= 1\nNot read yet.')
    expect(briefing).toContain('## 3. Ashes or Embers (embers)\nState on entering: trust = 2\nRead; nothing developed.')
    expect(briefing).toContain('trust (number, starts at 0): How far Mara trusts Rook.')
    expect(briefing).not.toContain('grain lift')
    expect(briefContinuity(s, 'nope', ledger)).toBeUndefined()
  })

  test('the request is the large tier with the fixed rubric', async () => {
    const request = continuityRequest(await story(), 'heist', {})!
    expect(request.workflow).toBe('check-continuity')
    expect(request.model).toBe('large')
    expect(request.system).toBe(CONTINUITY_RUBRIC)
    expect(request.system).toContain('A change over time is not a contradiction')
  })

  test('findings keep only evidence that points at scenes the story has, and drop empty messages', async () => {
    const s = await story()
    const findings = findingsFrom(
      {
        contradictions: [
          {
            message: 'Rook leaves the city in Cold Open and is at the market in Embers.',
            evidence: [
              { scene: 'scene:cold-open', quote: 'He left.' },
              { scene: 'embers', quote: 'He bought bread.' },
              { scene: 'gone', quote: 'x' },
            ],
          },
          { message: '  ', evidence: [] },
        ],
      },
      s,
      'heist',
      7,
    )
    expect(findings).toEqual([
      {
        id: 'heist-7-0',
        storyline: 'heist',
        message: 'Rook leaves the city in Cold Open and is at the market in Embers.',
        evidence: [
          { scene: 'cold-open', quote: 'He left.' },
          { scene: 'embers', quote: 'He bought bread.' },
        ],
      },
    ])
  })
})
