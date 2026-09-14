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
  test('synonyms become mentions, untracked entities and variables become define notes, and what the story has is never called missing', async () => {
    const s = await story()
    const dict = dictionary(s)
    const entry = ledgerEntryFrom(
      {
        synonyms: [
          { phrase: 'The door-woman', entity: 'character:mara' },
          { phrase: 'the ghost', entity: 'character:ghost' },
          { phrase: '', entity: 'character:mara' },
          { phrase: 'a line from her page, not this one', entity: 'character:mara' },
          { phrase: 'the text and then far too many words to be a phrase at all', entity: 'character:mara' },
        ],
        untracked_entities: [
          { name: 'the Atacam', kind: 'place', message: 'The Atacam is mentioned, but no place page describes it.', quote: 'the Atacam' },
          { name: 'the Keeper', kind: 'lore', message: 'The Keepers are mentioned, but no lore page describes them.', quote: 'q' },
          { name: 'Rook', kind: 'character', message: 'Rook is mentioned, but no page describes him.', quote: 'q' },
          { name: 'a thing of no kind', kind: 'widget', message: 'm', quote: 'q' },
          { name: '', kind: 'place', message: 'm', quote: 'q' },
        ],
        untracked_variables: [
          { name: 'trust', message: 'trust is untracked.', quote: 'q', variable: { id: 'trust', type: 'number', initial: '0', description: 'x' } },
          { name: 'how far Mara trusts Rook', message: 'Trust is state the story tests.', quote: 'q', variable: { id: 'TRUST', type: 'number', initial: '0', description: 'x' } },
          {
            name: 'Trust Level',
            message: 'Trust between them is state the story will want to test.',
            quote: 'q',
            variable: { id: 'Trust Level', type: 'number', initial: '0', description: 'How far.' },
            effect: 'trust_level += 1',
            condition: 'trust_level >= 1',
          },
          { name: 'whether the door is open', message: 'No proposal came with this one.', quote: 'q', variable: { id: '', type: 'boolean', initial: 'false', description: '' } },
          { name: 'a kind the engine has no type for', message: 'm', quote: 'q', variable: { id: 'door_open', type: 'string', initial: '', description: '' } },
        ],
        unlisted_characters: ['character:rook', 'character:ghost', 'place:the-vault'],
        developments: [
          { entity: 'character:mara', fact: ' Mara stops watching the door. ', quote: 'Maara stopped watching it.' },
          { entity: 'place:nowhere', fact: 'nothing', quote: '' },
          { entity: 'character:rook', fact: '', quote: 'q' },
        ],
        rejected: [
          { quote: 'Maara', candidate: 'character:mara', why: 'a different word' },
          { quote: 'x', candidate: 'nope', why: '' },
          { quote: 'Everything must live and then die', candidate: 'character:rook', why: 'a theme, not the lifter' },
        ],
        notes: [
          { kind: 'continuity', message: 'The Keepers page says Keepers cannot be replaced, and this page says one is.', quote: 'q', against: { where: 'lore:the-keepers', quote: 'No Keeper can be replaced.' }, suggestion: 'Decide which holds and fix the other.' },
          { kind: 'continuity', message: 'A topic with no other end at all here.', quote: 'q' },
          { kind: 'continuity', message: 'Topic only', quote: 'q', against: { where: 'lore:the-keepers', quote: 'x' } },
          { kind: 'define', message: 'an old kind that no longer exists in the answer', quote: 'q' },
          { kind: 'loose-end', message: '', quote: 'q' },
          { kind: 'other', message: 'Something an editor would say.', quote: 'q' },
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
        { kind: 'define', message: 'The Atacam is mentioned, but no place page describes it.', quote: 'the Atacam', name: 'the Atacam', defineAs: 'place' },
        {
          kind: 'define',
          message: 'Trust between them is state the story will want to test.',
          quote: 'q',
          name: 'Trust Level',
          defineAs: 'variable',
          variable: { id: 'trust_level', type: 'number', initial: '0', description: 'How far.' },
          effect: 'trust_level += 1',
        },
        { kind: 'define', message: 'Rook is in the prose but not listed on the scene.', quote: '', entity: 'character:rook', defineAs: 'character' },
        {
          kind: 'continuity',
          message: 'The Keepers page says Keepers cannot be replaced, and this page says one is.',
          quote: 'q',
          suggestion: 'Decide which holds and fix the other.',
          against: { where: 'lore:the-keepers', quote: 'No Keeper can be replaced.' },
        },
        { kind: 'other', message: 'Something an editor would say.', quote: 'q' },
      ],
    })
  })

  test('engine logic written in the prose becomes an engine note, with the variable it names proposed once', async () => {
    const s = await story()
    const dict = dictionary(s)
    const blank = { synonyms: [], untracked_entities: [], developments: [], rejected: [], notes: [] }
    const entry = ledgerEntryFrom(
      {
        ...blank,
        engine_in_prose: [
          {
            what: 'choice',
            message: 'The prose offers two options that raise or lower a raven variable; the scene has no choices, and no variable tracks the raven.',
            quote: 'Option 1: "Don’t sass me!" -= to ravens variable',
            suggestion: 'Put the two options on the scene as choices, each with its effect, and declare raven_trust.',
            variable: { id: 'raven_trust', type: 'number', initial: '0', description: 'How far the raven trusts Dalia.' },
            effect: 'raven_trust += 1',
          },
          { what: 'effect', message: 'The prose adds to trust; the scene already carries that effect.', quote: 'q', variable: { id: 'trust', type: 'number', initial: '0', description: 'x' } },
          { what: 'gate', message: 'A kind the engine has no word for, so it is dropped.', quote: 'q' },
          { what: 'condition', message: 'Topic only', quote: 'q' },
        ],
        untracked_variables: [
          { name: 'the raven again', message: 'Proposed twice: once here, once above.', quote: 'q', variable: { id: 'raven_trust', type: 'number', initial: '0', description: 'x' }, effect: 'raven_trust -= 1' },
          { name: 'how tired Dalia is', message: 'A mood with nothing the engine would write or test.', quote: 'q', variable: { id: 'dalia_fatigue_level', type: 'number', initial: '0', description: 'x' } },
          { name: 'whether the crossing is open', message: 'Assumed by this page, tested by a condition.', quote: 'q', variable: { id: 'crossing_open', type: 'boolean', initial: 'true', description: 'x' }, condition: 'crossing_open == false' },
        ],
      },
      'the text',
      dict,
      1,
      'scene:the-job-offer',
    )
    expect(entry.notes).toEqual([
      {
        kind: 'engine',
        message: 'The prose offers two options that raise or lower a raven variable; the scene has no choices, and no variable tracks the raven.',
        quote: 'Option 1: "Don’t sass me!" -= to ravens variable',
        suggestion: 'Put the two options on the scene as choices, each with its effect, and declare raven_trust.',
        name: 'How far the raven trusts Dalia',
        defineAs: 'variable',
        variable: { id: 'raven_trust', type: 'number', initial: '0', description: 'How far the raven trusts Dalia.' },
        effect: 'raven_trust += 1',
      },
      { kind: 'engine', message: 'The prose adds to trust; the scene already carries that effect.', quote: 'q' },
      {
        kind: 'define',
        message: 'Assumed by this page, tested by a condition.',
        quote: 'q',
        name: 'whether the crossing is open',
        defineAs: 'variable',
        variable: { id: 'crossing_open', type: 'boolean', initial: 'true', description: 'x' },
      },
    ])
  })

  test('a continuity note against the page itself is a draft in progress, kept as a plain note', async () => {
    const s = await story()
    const dict = dictionary(s)
    const blank = { synonyms: [], untracked_entities: [], developments: [], rejected: [] }
    const notes = ledgerEntryFrom(
      {
        ...blank,
        notes: [
          { kind: 'continuity', message: 'The second beat has the neighbour, and the prose never reaches it.', quote: 'q', against: { where: 'scene:the-job-offer synopsis', quote: 'Dax lays out the Vault job.' } },
          { kind: 'continuity', message: 'The prose ends before the beats do, on this same page.', quote: 'q', against: { where: 'scene:the-job-offer', quote: 'Something shifts.' } },
          { kind: 'continuity', message: 'The Keepers page says one thing and this page says another.', quote: 'q', against: { where: 'lore:the-keepers', quote: 'A Keeper holds the forest.' } },
        ],
      },
      'the text',
      dict,
      1,
      'scene:the-job-offer',
    ).notes
    expect(notes).toEqual([
      { kind: 'other', message: 'The second beat has the neighbour, and the prose never reaches it.', quote: 'q' },
      { kind: 'other', message: 'The prose ends before the beats do, on this same page.', quote: 'q' },
      { kind: 'continuity', message: 'The Keepers page says one thing and this page says another.', quote: 'q', against: { where: 'lore:the-keepers', quote: 'A Keeper holds the forest.' } },
    ])
  })

  test('a "missing" claim about a page the story has is dropped, however the read spelt the name', async () => {
    const s = await story()
    s.references.set('eeltown', { kind: 'place', id: 'eeltown', title: 'Eeltown', tags: [], images: [], aliases: [], body: '' })
    s.references.set('the-landing', { kind: 'place', id: 'the-landing', title: 'The Landing at Marrow Point', tags: [], images: [], aliases: [], body: '' })
    const dict = dictionary(s)
    const claim = (name: string, suggestion = '') => ({ name, kind: 'place', message: `${name} is mentioned, but no place page describes it.`, quote: 'q', suggestion })
    const output = {
      synonyms: [],
      untracked_entities: [
        claim('Eel town'),
        claim('the Eel-Town'),
        claim('Marrow Point', 'No action needed; place:the-landing is already in the library.'),
        claim('Marrow Point'),
      ],
      developments: [],
      rejected: [],
      notes: [],
    }
    expect(ledgerEntryFrom(output, 'the text', dict, 1, 'scene:the-job-offer').notes.map((n) => n.name)).toEqual(['Marrow Point'])
  })

  test('an unlisted character is a scene\'s business; on a note or a page it is dropped', async () => {
    const s = await story()
    const dict = dictionary(s)
    const output = { synonyms: [], untracked_entities: [], unlisted_characters: ['character:rook'], developments: [], rejected: [], notes: [] }
    expect(ledgerEntryFrom(output, 'the text', dict, 1, 'note:plan').notes).toEqual([])
    expect(ledgerEntryFrom(output, 'the text', dict, 1, 'scene:the-job-offer').notes).toHaveLength(1)
  })

  test('a variable filed under the entities, as an older prompt would, is still a proposal', async () => {
    const s = await story()
    const output = {
      synonyms: [],
      untracked_entities: [{ name: 'door_open', kind: 'variable', message: 'Whether the door is open is state.', quote: 'q', variable: { id: 'door_open', type: 'boolean', initial: 'false', description: 'd' }, effect: 'door_open = true' }],
      developments: [],
      rejected: [],
      notes: [],
    }
    expect(ledgerEntryFrom(output, 'the text', dictionary(s), 1, 'scene:the-job-offer').notes).toEqual([
      { kind: 'define', message: 'Whether the door is open is state.', quote: 'q', name: 'door_open', defineAs: 'variable', variable: { id: 'door_open', type: 'boolean', initial: 'false', description: 'd' }, effect: 'door_open = true' },
    ])
  })
})
