import { describe, expect, test } from 'vitest'
import { dictionary } from '../mentions/match'
import { loadStory } from '../story/loadStory'
import { embersFiles } from '../test/embers'
import { hashText, type Ledger } from './ledger'
import { briefReadScene, ledgerEntryFrom, readSceneRequest, READ_SCENE_RUBRIC } from './readScene'

const PROSE = `## Prose

Mara watched the door. Maara stopped watching it. The door-woman spoke to the lifter.
`

async function story() {
  const files = embersFiles()
  await files.writeText('characters/rook.md', '---\nid: rook\naliases: [the lifter]\n---\n\n# Rook\n\nA lifter.\n')
  await files.writeText('notes/plan.md', '---\nid: plan\n---\n\n# The Plan\n\nRook goes first.\n')
  await files.writeText(
    'scenes/the-job-offer.md',
    `---\nid: the-job-offer\nstorylines: [heist, mara]\nact: act-1\ncondition: trust >= 1\neffects: [trust += 1]\ncharacters: [mara, rook]\n---\n\n# The Job Offer\n\n## Synopsis\n\nDax lays out the Vault job.\n\n## Beats\n\n1. Something shifts.\n\n${PROSE}`,
  )
  await files.writeText('variables.json', JSON.stringify({ variables: [{ id: 'trust', type: 'number', initial: 0, description: 'How far Mara trusts Rook.' }] }))
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded.story
}

describe('the read-scene briefing', () => {
  test('carries the item, the roster with keys and aliases, what the matcher found, what came before, and the variables', async () => {
    const s = await story()
    const ledger: Ledger = {
      'scene:cold-open': { hash: 'h', readAt: 1, mentions: [], rejected: [], developments: [{ entity: 'character:rook', fact: 'Rook has the ledger scrap.', quote: 'q' }] },
    }
    const briefing = briefReadScene(s, 'scene:the-job-offer', dictionary(s), ledger)!
    expect(briefing).toContain('# The item: scene "The Job Offer" (scene:the-job-offer)')
    expect(briefing).toContain('Dax lays out the Vault job.')
    expect(briefing).toContain('1. Something shifts.')
    expect(briefing).toContain('Mara watched the door.')
    expect(briefing).toContain('Characters the writer listed on this scene: mara, rook')
    expect(briefing).toContain('characters: Mara (character:mara); Rook (character:rook) — also called "the lifter"')
    expect(briefing).toContain('notes: The Plan (note:plan)')
    expect(briefing).toContain('Cold Open: Lowmarket (scene:cold-open)')
    expect(briefing).not.toContain('The Job Offer (scene:the-job-offer)')
    expect(briefing).toContain('"Mara" → character:mara')
    expect(briefing).toContain('"the lifter" → character:rook')
    expect(briefing).toContain('"Maara" → character:mara?')
    expect(briefing).toContain('Along The Heist, the scene before is "Cold Open: Lowmarket", which developed: character:rook: Rook has the ledger scrap.')
    expect(briefing).not.toContain("Along Mara's Trust")
    expect(briefing).toContain('trust (number, "How far Mara trusts Rook.") — effect: trust += 1; condition: trust >= 1')
  })

  test('a note is briefed as its text, with no lane or variables', async () => {
    const s = await story()
    const briefing = briefReadScene(s, 'note:plan', dictionary(s), {})!
    expect(briefing).toContain('# The item: note "The Plan" (note:plan)')
    expect(briefing).toContain('## Text\n\nRook goes first.')
    expect(briefing).not.toContain('What came before')
    expect(briefing).not.toContain('Variables')
    expect(briefReadScene(s, 'scene:nope', dictionary(s), {})).toBeUndefined()
  })

  test('the request carries the rubric, default or the writer’s own, with the glossary, and stays small', async () => {
    const s = await story()
    const request = readSceneRequest(s, 'scene:the-job-offer', dictionary(s), {})!
    expect(request.workflow).toBe('read-scene')
    expect(request.system.startsWith(READ_SCENE_RUBRIC)).toBe(true)
    expect(request.system).toContain('Vocabulary, which you use and do not translate')
    expect(request.briefing.length).toBeLessThan(4000)
    const own = readSceneRequest(s, 'scene:the-job-offer', dictionary(s), {}, 'Read it my way.\n')!
    expect(own.system.startsWith('Read it my way.\n\nVocabulary')).toBe(true)
  })
})

describe('what the read leaves in the ledger', () => {
  test('keys the roster lacks are dropped, blanks are dropped, the hash is of the text read', async () => {
    const s = await story()
    const dict = dictionary(s)
    const entry = ledgerEntryFrom(
      {
        mentions: [
          { quote: 'The door-woman', entity: 'character:mara' },
          { quote: 'the ghost', entity: 'character:ghost' },
          { quote: '', entity: 'character:mara' },
        ],
        rejected: [{ quote: 'Maara', candidate: 'character:mara', why: 'a different word' }, { quote: 'x', candidate: 'nope', why: '' }],
        developments: [
          { entity: 'character:mara', fact: ' Mara stops watching the door. ', quote: 'Maara stopped watching it.' },
          { entity: 'place:nowhere', fact: 'nothing', quote: '' },
          { entity: 'character:rook', fact: '', quote: 'q' },
        ],
      },
      'the text',
      dict,
      42,
    )
    expect(entry).toEqual({
      hash: hashText('the text'),
      readAt: 42,
      mentions: [{ quote: 'The door-woman', entity: 'character:mara' }],
      rejected: [{ quote: 'Maara', candidate: 'character:mara', why: 'a different word' }],
      developments: [{ entity: 'character:mara', fact: 'Mara stops watching the door.', quote: 'Maara stopped watching it.' }],
    })
  })
})
