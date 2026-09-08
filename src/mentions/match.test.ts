import { describe, expect, test } from 'vitest'
import type { Note, ReferenceEntity, ReferenceKind, Scene, Story } from '../domain/types'
import { dictionary, editDistance, findMentions, mentionIndex, type Span } from './match'

function scene(id: string, title: string, prose: string, extra: Partial<Scene> = {}): Scene {
  return {
    id,
    title,
    storylines: [],
    tags: [],
    characters: [],
    effects: [],
    choices: [],
    synopsis: '',
    beats: [],
    prose,
    images: [],
    ...extra,
  }
}

function entity(kind: ReferenceKind, id: string, title: string, aliases: string[] = [], body = ''): ReferenceEntity {
  return { kind, id, title, tags: [], images: [], aliases, body }
}

function note(id: string, title: string, body = ''): Note {
  return { id, title, tags: [], body }
}

/** A story small enough to read: two characters, a place, a lore page, a note, a scene, a variable. */
function story(overrides: Partial<Story> = {}): Story {
  const references = new Map<string, ReferenceEntity>()
  for (const e of [
    entity('character', 'rook', 'Rook', [], 'A lifter.'),
    entity('character', 'mara', 'Mara', [], 'The door-woman.'),
    entity('character', 'dalia', 'Dalia'),
    entity('place', 'the-vault', 'The Vault'),
    entity('lore', 'dalias-blessing', "Dalia's Blessing"),
  ]) {
    references.set(e.id, e)
  }
  return {
    manifest: { title: 'T', acts: [], storylines: [], settings: {} },
    scenes: new Map([['cold-open', scene('cold-open', 'Cold Open: Lowmarket', 'The tollmen came at the wrong bell.')]]),
    references,
    notes: new Map([['timeline', note('timeline', 'Timeline')]]),
    registry: { variables: [{ id: 'trust', type: 'number', initial: 0 }, { id: 'mara_alive', type: 'boolean', initial: true }] },
    playthroughs: [],
    verdicts: {},
    ...overrides,
  }
}

const brief = (spans: Span[]) => spans.map((s) => [s.quote, s.targets.map((t) => `${t.kind}:${t.id}`).join('|'), s.certainty])

describe('the literal pass', () => {
  const dict = dictionary(story())

  test('finds titles as whole words, in order', () => {
    const spans = findMentions('Rook fed the stove. Mara watched the door.', dict)
    expect(brief(spans)).toEqual([
      ['Rook', 'character:rook', 'certain'],
      ['Mara', 'character:mara', 'certain'],
    ])
    expect(spans[0]).toMatchObject({ from: 0, to: 4 })
    expect(spans[1]).toMatchObject({ from: 20, to: 24 })
  })

  test('a possessive rides along, straight or curly', () => {
    expect(brief(findMentions("The embers ride warm against Rook's ribs, the Vault’s own fire.", dict))).toEqual([
      ["Rook's", 'character:rook', 'certain'],
      ['the Vault’s', 'place:the-vault', 'certain'],
    ])
  })

  test('a leading article may lose its capital; the name may not', () => {
    expect(brief(findMentions('She went down to the Vault.', dict))).toEqual([['the Vault', 'place:the-vault', 'certain']])
    expect(findMentions('She checked the vault under the floorboards.', dict)).toEqual([])
    expect(findMentions('mara was not there.', dict)).toEqual([])
  })

  test('the longest name wins, so a lore page swallows the character inside it', () => {
    expect(brief(findMentions("She asked for Dalia's Blessing before the climb.", dict))).toEqual([
      ["Dalia's Blessing", 'lore:dalias-blessing', 'certain'],
    ])
    expect(brief(findMentions("Dalia's hands were cold.", dict))).toEqual([["Dalia's", 'character:dalia', 'certain']])
  })

  test('a scene title keeps its punctuation', () => {
    expect(brief(findMentions('Back in Cold Open: Lowmarket, nobody ran.', dict))).toEqual([
      ['Cold Open: Lowmarket', 'scene:cold-open', 'certain'],
    ])
    expect(findMentions('Cold Open. Lowmarket was quiet.', dict)).toEqual([])
  })

  test('a variable id matches as itself, never as a word inside another', () => {
    expect(brief(findMentions('If mara_alive still holds, trust moves.', dict))).toEqual([
      ['mara_alive', 'variable:mara_alive', 'certain'],
      ['trust', 'variable:trust', 'certain'],
    ])
    expect(findMentions('distrust', dict)).toEqual([])
  })

  test('a note titled like a character shows both, and a page never names itself', () => {
    const s = story()
    s.notes.set('mara', note('mara', 'Mara', 'Everything Mara does.'))
    const d = dictionary(s)
    expect(brief(findMentions('Mara waited.', d))).toEqual([['Mara', 'character:mara|note:mara', 'certain']])
    expect(brief(findMentions('Mara waited.', d, { self: 'character:mara' }))).toEqual([['Mara', 'note:mara', 'certain']])
    expect(findMentions('Rook waited.', d, { self: 'character:rook' })).toEqual([])
  })

  test('an alias is a name like any other', () => {
    const s = story()
    s.references.set('rook', entity('character', 'rook', 'Rook', ['the smith', "Rook of Tanner's Row"]))
    const d = dictionary(s)
    expect(brief(findMentions("The smith nodded. Rook of Tanner's Row, they called him.", d))).toEqual([
      ['The smith', 'character:rook', 'certain'],
      ["Rook of Tanner's Row", 'character:rook', 'certain'],
    ])
  })
})

describe('the fuzzy pass', () => {
  const dict = dictionary(story())

  test('a misspelt name is a probable, with the name it is near', () => {
    expect(brief(findMentions("Daila's hands were cold.", dict))).toEqual([["Daila's", 'character:dalia', 'probable']])
    expect(brief(findMentions('Mraa fed the stove.', dict))).toEqual([['Mraa', 'character:mara', 'probable']])
  })

  test('short words, lower-case words, and variable ids never fuzz', () => {
    expect(findMentions('Mra fed the stove.', dict)).toEqual([])
    expect(findMentions('daila was cold.', dict)).toEqual([])
    expect(findMentions('A rust-red door.', dict)).toEqual([])
  })

  test('a word the story uses often is never a near miss', () => {
    const s = story()
    s.scenes.set('walls', scene('walls', 'Walls', 'Wall after Wall after Wall, and one more Wall.'))
    s.references.set('will', entity('character', 'will', 'Will'))
    expect(findMentions('Wall of the keep.', dictionary(s))).toEqual([])
    // Without the story's own frequency, the same word would fuzz to Will.
    const bare = story()
    bare.references.set('will', entity('character', 'will', 'Will'))
    expect(brief(findMentions('Wall of the keep.', dictionary(bare)))).toEqual([['Wall', 'character:will', 'probable']])
  })

  test('the bound widens with the name: one edit up to five letters, two beyond', () => {
    expect(editDistance('daila', 'dalia', 2)).toBe(1)
    expect(editDistance('mraa', 'mara', 1)).toBe(1)
    expect(editDistance('rooks', 'rook', 1)).toBe(1)
    expect(editDistance('abcdef', 'xyzdef', 2)).toBe(3)
    const s = story()
    s.references.set('petronella', entity('character', 'petronella', 'Petronella'))
    expect(brief(findMentions('Petronela came. Petroneela came too.', dictionary(s)))).toEqual([
      ['Petronela', 'character:petronella', 'probable'],
      ['Petroneela', 'character:petronella', 'probable'],
    ])
  })
})

describe('verdicts', () => {
  const dict = dictionary(story())

  test("a writer's 'not a mention' silences the phrase everywhere in the item", () => {
    const spans = findMentions('Rook never appears. Rook is elsewhere. Mara does.', dict, {
      verdicts: [{ quote: 'Rook', entity: null, by: 'writer' }],
    })
    expect(brief(spans)).toEqual([['Mara', 'character:mara', 'certain']])
  })

  test('a verdict on a phrase no name covers makes it a mention', () => {
    const writer = findMentions('The smith nodded to the old man.', dict, {
      verdicts: [
        { quote: 'the smith', entity: 'character:rook', by: 'writer' },
        { quote: 'the old man', entity: 'character:dalia', by: 'model' },
      ],
    })
    expect(brief(writer)).toEqual([
      ['The smith', 'character:rook', 'certain'],
      ['the old man', 'character:dalia', 'model'],
    ])
  })

  test('a verdict settles a tie and a near miss', () => {
    const s = story()
    s.notes.set('mara', note('mara', 'Mara'))
    const d = dictionary(s)
    expect(brief(findMentions('Mara waited. Daila too.', d, {
      verdicts: [
        { quote: 'Mara', entity: 'note:mara', by: 'writer' },
        { quote: 'Daila', entity: 'character:dalia', by: 'writer' },
      ],
    }))).toEqual([
      ['Mara', 'note:mara', 'certain'],
      ['Daila', 'character:dalia', 'certain'],
    ])
  })

  test("the writer's verdict outranks the model's on the same phrase", () => {
    const spans = findMentions('The smith nodded.', dict, {
      verdicts: [
        { quote: 'the smith', entity: 'character:dalia', by: 'model' },
        { quote: 'the smith', entity: 'character:rook', by: 'writer' },
      ],
    })
    expect(brief(spans)).toEqual([['The smith', 'character:rook', 'certain']])
  })
})

describe('mentionIndex', () => {
  test('lists, per thing, every item that names it and how often', () => {
    const s = story()
    s.scenes.set('duel', scene('duel', 'Rooftop Duel', "Rook's blade. Rook's fog. The Vault below."))
    s.notes.set('plan', note('plan', 'The Plan', 'Rook goes first.'))
    s.verdicts = { 'note:plan': [{ quote: 'Rook', entity: null, by: 'writer' }] }
    const index = mentionIndex(s)
    expect(index.get('character:rook')).toEqual([{ item: { kind: 'scene', id: 'duel', title: 'Rooftop Duel' }, count: 2 }])
    expect(index.get('place:the-vault')).toEqual([{ item: { kind: 'scene', id: 'duel', title: 'Rooftop Duel' }, count: 1 }])
    expect(index.get('character:mara')).toBeUndefined()
  })
})
