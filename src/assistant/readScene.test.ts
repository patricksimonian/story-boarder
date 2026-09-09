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
  await files.writeText('lore/the-keepers.md', '---\nid: the-keepers\n---\n\n# The Keepers\n\nA Keeper holds the forest.\n')
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
  test('carries the item, its engine, the world it touches, what the story has, what the matcher found, what came before, and the registry', async () => {
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
    expect(briefing).toContain("The scene's engine: gated by: trust >= 1; effect: trust += 1")
    expect(briefing).toContain('# The world this page touches')
    expect(briefing).toContain('## character: Rook (character:rook) — also called "the lifter"\n\nA lifter.')
    expect(briefing).toContain('# Notes that bear on it (the notebook)\n\n## note: The Plan (note:plan)\n\nRook goes first.')
    expect(briefing).toContain('characters: Mara (character:mara): The door-woman.; Rook (character:rook) — also called "the lifter": A lifter.')
    expect(briefing).toContain('notes: The Plan (note:plan)')
    expect(briefing).toContain('Cold Open: Lowmarket (scene:cold-open)')
    expect(briefing).not.toContain('The Job Offer (scene:the-job-offer)')
    expect(briefing).toContain('"Mara" → character:mara')
    expect(briefing).toContain('"the lifter" → character:rook')
    expect(briefing).toContain('"Maara" → character:mara?')
    expect(briefing).toContain('Along The Heist, the scene before is "Cold Open: Lowmarket" (scene:cold-open), which developed: character:rook: Rook has the ledger scrap.')
    expect(briefing).not.toContain("Along Mara's Trust")
    expect(briefing).toContain('# The variables (the registry, all of it)')
    expect(briefing).toContain('trust (number, starts at 0, "How far Mara trusts Rook.") — on this scene: effect: trust += 1; condition: trust >= 1')
  })

  test('a page is briefed with the scenes and notes that name it, and with what other reads said is missing', async () => {
    const s = await story()
    const ledger: Ledger = {
      'scene:cold-open': {
        hash: 'h',
        readAt: 1,
        mentions: [],
        rejected: [],
        developments: [],
        notes: [{ kind: 'define', message: 'The Owl Leader has no page.', quote: 'the Owl Leader', name: 'the Owl Leader', defineAs: 'character' }],
      },
    }
    const briefing = briefReadScene(s, 'character:rook', dictionary(s), ledger)!
    expect(briefing).toContain('# The item: character "Rook" (character:rook)')
    expect(briefing).toContain('# Where this page is named (read these for its subject too)')
    expect(briefing).toContain('## scene: The Job Offer (scene:the-job-offer)')
    expect(briefing).toContain('The door-woman spoke to the lifter.')
    expect(briefing).toContain('## note: The Plan (note:plan)\n\nRook goes first.')
    expect(briefing).toContain('# Things other reads said the story lacks\n\nthe Owl Leader (character, flagged on Cold Open: Lowmarket)')
    // A scene's briefing does not list its namers; its lane and engine do that work.
    expect(briefReadScene(s, 'scene:the-job-offer', dictionary(s), ledger)).not.toContain('Where this page is named')
  })

  test('a note is briefed as its text, with no lane or variables', async () => {
    const s = await story()
    const briefing = briefReadScene(s, 'note:plan', dictionary(s), {})!
    expect(briefing).toContain('# The item: note "The Plan" (note:plan)')
    expect(briefing).toContain('## Text\n\nRook goes first.')
    expect(briefing).not.toContain('What came before')
    expect(briefing).not.toContain('The variables')
    expect(briefReadScene(s, 'scene:nope', dictionary(s), {})).toBeUndefined()
  })

  test('the request carries the rubric, default or the writer’s own, with the glossary, and stays small', async () => {
    const s = await story()
    const request = readSceneRequest(s, 'scene:the-job-offer', dictionary(s), {})!
    expect(request.workflow).toBe('read-scene')
    expect(request.system.startsWith(READ_SCENE_RUBRIC)).toBe(true)
    expect(request.system).toContain('Vocabulary, which you use and do not translate')
    expect(request.briefing.length).toBeLessThan(6000)
    const own = readSceneRequest(s, 'scene:the-job-offer', dictionary(s), {}, 'Read it my way.\n')!
    expect(own.system.startsWith('Read it my way.\n\nVocabulary')).toBe(true)
  })
})

describe('what the read leaves in the ledger', () => {
  test('keys the story lacks are dropped, blanks are dropped, the hash is of the text read', async () => {
    const s = await story()
    const dict = dictionary(s)
    const entry = ledgerEntryFrom(
      {
        mentions: [
          { quote: 'The door-woman', entity: 'character:mara' },
          { quote: 'the ghost', entity: 'character:ghost' },
          { quote: '', entity: 'character:mara' },
          { quote: 'a line from her page, not this one', entity: 'character:mara' },
          { quote: 'the text and then far too many words to be a phrase at all', entity: 'character:mara' },
        ],
        rejected: [
          { quote: 'Maara', candidate: 'character:mara', why: 'a different word' },
          { quote: 'x', candidate: 'nope', why: '' },
          { quote: 'Everything must live and then die', candidate: 'character:rook', why: 'a theme, not the lifter' },
        ],
        developments: [
          { entity: 'character:mara', fact: ' Mara stops watching the door. ', quote: 'Maara stopped watching it.' },
          { entity: 'place:nowhere', fact: 'nothing', quote: '' },
          { entity: 'character:rook', fact: '', quote: 'q' },
        ],
        notes: [
          { kind: 'define', message: 'The Atacam has no page.', quote: 'the Atacam', name: 'the Atacam', defineAs: 'place' },
          { kind: 'define', message: 'The Keepers are mentioned, but no lore page describes them.', quote: 'q', name: 'the Keeper', defineAs: 'lore' },
          { kind: 'define', message: 'Rook is mentioned, but no page describes him.', quote: 'q', name: 'Rook', defineAs: 'character' },
          { kind: 'define', message: 'trust is untracked.', quote: 'q', name: 'trust', defineAs: 'variable', variable: { id: 'trust', type: 'number', initial: '0', description: 'x' } },
          { kind: 'define', message: 'Trust between them is state the story will want to test.', quote: 'q', name: 'Trust Level', defineAs: 'variable', variable: { id: 'Trust Level', type: 'number', initial: '0', description: 'How far.' } },
          { kind: 'continuity', message: 'The Keepers page says Keepers cannot be replaced, and this page says one is.', quote: 'q', against: { where: 'lore:the-keepers', quote: 'No Keeper can be replaced.' }, suggestion: 'Decide which holds and fix the other.' },
          { kind: 'continuity', message: 'A topic with no other end at all here.', quote: 'q' },
          { kind: 'continuity', message: 'Topic only', quote: 'q', against: { where: 'lore:the-keepers', quote: 'x' } },
          { kind: 'define', message: 'Rook is here and not listed.', quote: 'Rook fed the stove.', entity: 'character:rook', defineAs: 'character' },
          { kind: 'define', message: 'names nothing', quote: 'q' },
          { kind: 'cast', message: 'an old kind', quote: 'q', name: 'x' },
          { kind: 'loose-end', message: '', quote: 'q' },
          { kind: 'other', message: 'Something an editor would say.', quote: 'q', entity: 'character:ghost' },
        ],
      },
      'the text, where the door-woman stood, and Maara too',
      dict,
      42,
    )
    expect(entry).toEqual({
      hash: hashText('the text, where the door-woman stood, and Maara too'),
      readAt: 42,
      mentions: [{ quote: 'The door-woman', entity: 'character:mara' }],
      rejected: [{ quote: 'Maara', candidate: 'character:mara', why: 'a different word' }],
      developments: [{ entity: 'character:mara', fact: 'Mara stops watching the door.', quote: 'Maara stopped watching it.' }],
      notes: [
        { kind: 'define', message: 'The Atacam has no page.', quote: 'the Atacam', name: 'the Atacam', defineAs: 'place' },
        {
          kind: 'define',
          message: 'Trust between them is state the story will want to test.',
          quote: 'q',
          name: 'Trust Level',
          defineAs: 'variable',
          variable: { id: 'trust_level', type: 'number', initial: '0', description: 'How far.' },
        },
        {
          kind: 'continuity',
          message: 'The Keepers page says Keepers cannot be replaced, and this page says one is.',
          quote: 'q',
          suggestion: 'Decide which holds and fix the other.',
          against: { where: 'lore:the-keepers', quote: 'No Keeper can be replaced.' },
        },
        { kind: 'define', message: 'Rook is here and not listed.', quote: 'Rook fed the stove.', entity: 'character:rook', defineAs: 'character' },
        { kind: 'other', message: 'Something an editor would say.', quote: 'q' },
      ],
    })
  })

  test('a "not listed on the scene" note is dropped on a note or a page, which have no characters field', async () => {
    const s = await story()
    const dict = dictionary(s)
    const output = {
      mentions: [],
      rejected: [],
      developments: [],
      notes: [{ kind: 'define', message: 'Rook is on this page but not listed anywhere.', quote: 'q', entity: 'character:rook', defineAs: 'character' }],
    }
    expect(ledgerEntryFrom(output, 'the text', dict, 1, 'note:plan').notes).toEqual([])
    expect(ledgerEntryFrom(output, 'the text', dict, 1, 'scene:the-job-offer').notes).toHaveLength(1)
  })
})
