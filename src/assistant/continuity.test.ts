import { describe, expect, test } from 'vitest'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { briefContinuity, continuityRequest, CONTINUITY_RUBRIC, findingsFrom, laneContext, walkStoryline } from './continuity'
import type { Ledger } from './ledger'

async function story() {
  const files = embersFiles()
  await files.writeText(
    'scenes/cold-open.md',
    '---\nid: cold-open\nstorylines: [heist]\nact: act-1\neffects: [trust += 2]\ncharacters: [rook]\n---\n\n# Cold Open: Lowmarket\n\n## Synopsis\n\nA grain lift goes sideways.\n\n## Beats\n\n1. The tollmen arrive early.\n\n## Prose\n\nRook was under the awning when the whistles started. He thought of the Vault.\n',
  )
  await files.writeText('characters/rook.md', '---\nid: rook\naliases: [the lifter]\n---\n\n# Rook\n\nA lifter. Owns nothing but the ledger scrap.\n')
  await files.writeText('places/the-vault.md', '---\nid: the-vault\n---\n\n# The Vault\n\nSealed before the founding.\n')
  await files.writeText('lore/the-founding.md', '---\nid: the-founding\n---\n\n# The Founding\n\nNobody checks.\n')
  await files.writeText('notes/heist-plan.md', '---\nid: heist-plan\n---\n\n# The Heist Plan\n\nRook goes first, then the Vault.\n')
  await files.writeText('notes/recipes.md', '---\nid: recipes\n---\n\n# Recipes\n\nBread, mostly.\n')
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

  test('the world it carries is what the lane names: pages by the characters field, the matcher, and the reads; notes that name them', async () => {
    const s = await story()
    const ledger: Ledger = { 'scene:embers': entry([{ entity: 'lore:the-founding', fact: 'The founding is a story.', quote: 'q' }]) }
    const { pages, notes } = laneContext(s, 'heist', ledger)
    expect(pages.map((p) => `${p.kind}:${p.id}`)).toEqual(['character:rook', 'lore:the-founding', 'place:the-vault'])
    expect(notes.map((n) => n.id)).toEqual(['heist-plan'])
    // Mara's lane names Mara only through the synopsis of her scene; the heist lane does not.
    expect(laneContext(s, 'mara', {}).pages.map((p) => p.id)).toEqual(['mara', 'the-vault'])
  })

  test('carries the world first, then each scene with its state, synopsis and beats, and developments or unread prose', async () => {
    const s = await story()
    const ledger: Ledger = {
      'scene:embers': entry([]),
      'scene:the-job-offer': entry([{ entity: 'character:rook', fact: 'Rook takes the job.', quote: 'Dax lays out the Vault job.' }]),
    }
    const briefing = briefContinuity(s, 'heist', ledger)!
    expect(briefing.indexOf('# The world this storyline touches')).toBeLessThan(briefing.indexOf('# Storyline "The Heist"'))
    expect(briefing).toContain('## character: Rook (character:rook) — also called "the lifter"\n\nA lifter. Owns nothing but the ledger scrap.')
    expect(briefing).toContain('## place: The Vault (place:the-vault)\n\nSealed before the founding.')
    expect(briefing).toContain('# Notes that bear on it\n\n## note: The Heist Plan (note:heist-plan)\n\nRook goes first, then the Vault.')
    expect(briefing).not.toContain('Recipes')
    expect(briefing).toContain(
      '## 1. Cold Open: Lowmarket (cold-open)\nState on entering: trust = 2\nCharacters listed: rook\nSynopsis: A grain lift goes sideways.\nBeats: 1. The tollmen arrive early.\nNot read yet; the prose:\n\nRook was under the awning when the whistles started. He thought of the Vault.',
    )
    expect(briefing).toContain('## 2. The Job Offer (the-job-offer)\nState on entering: trust = 2\nGated by: trust >= 1\nSynopsis: Dax lays out the Vault job.')
    expect(briefing).toContain('- character:rook: Rook takes the job. — "Dax lays out the Vault job."')
    expect(briefing).toContain('## 3. Ashes or Embers (embers)\nState on entering: trust = 2\nSynopsis: What the Vault held.')
    expect(briefing).toContain('Read; nothing developed.')
    expect(briefing).toContain('trust (number, starts at 0): How far Mara trusts Rook.')
    expect(briefContinuity(s, 'nope', ledger)).toBeUndefined()
  })

  test('a long page is cut at a sentence and says so', async () => {
    const s = await story()
    const long = `${'Sealed before the founding. '.repeat(120)}The end.`
    s.references.get('the-vault')!.body = long
    const briefing = briefContinuity(s, 'heist', {})!
    expect(briefing).toContain('[… cut here; the page goes on]')
    expect(briefing).not.toContain('The end.')
  })

  test('the request carries the rubric with the glossary', async () => {
    const request = continuityRequest(await story(), 'heist', {})!
    expect(request.workflow).toBe('check-continuity')
    expect(request.system.startsWith(CONTINUITY_RUBRIC)).toBe(true)
    expect(request.system).toContain('A change over time is not a contradiction')
    expect(request.system).toContain('a scene against the world the library and notes lay down')
    expect(request.system).toContain('Vocabulary, which you use and do not translate')
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
