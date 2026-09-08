import { describe, expect, test } from 'vitest'
import type { Story } from '../domain/types'
import { describeTarget, pageParagraphs } from './describe'
import type { MentionSite } from './match'

const story: Story = {
  manifest: { title: 'T', acts: [], storylines: [], settings: {} },
  scenes: new Map(),
  references: new Map([
    [
      'mara',
      {
        kind: 'character',
        id: 'mara',
        title: 'Mara',
        tags: ['crew'],
        images: ['assets/mara.png'],
        aliases: ['the door-woman'],
        body: "The door-woman. Branded with the Warden's eye on the inside of her wrist — everyone below the tide line knows what that means, and everyone is wrong about it. A second paragraph follows and says more.\n\nSecond paragraph.",
      },
    ],
  ]),
  notes: new Map(),
  registry: { variables: [{ id: 'trust', type: 'number', initial: 0, description: 'How far Mara trusts Rook.' }] },
  playthroughs: [],
  verdicts: {},
}

const site = (id: string, title: string, count: number): MentionSite => ({ item: { kind: 'scene', id, title }, count })

describe('describeTarget', () => {
  test('a page: kind, title, first paragraph cut at a sentence, nearest other namers by count, and the whole page behind it', () => {
    const index = new Map([
      ['character:mara', [site('a', 'Alpha', 1), site('b', 'Beta', 4), site('c', 'Cistern', 2), site('d', 'Delta', 2), site('here', 'Here', 9)]],
    ])
    const card = describeTarget(story, 'character:mara', 'scene:here', index)
    expect(card).toMatchObject({
      kind: 'character',
      title: 'Mara',
      others: ['Beta', 'Cistern', 'Delta'],
      othersCount: 4,
      tags: ['crew'],
      aliases: ['the door-woman'],
      images: ['assets/mara.png'],
    })
    expect(card?.lines).toEqual([
      "The door-woman. Branded with the Warden's eye on the inside of her wrist — everyone below the tide line knows what that means, and everyone is wrong about it.",
    ])
    expect(card?.body.startsWith('The door-woman.')).toBe(true)
    expect(card?.namedIn.map((t) => t.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  test('developments, when there are any, replace the excerpt and ride along in full', () => {
    const about = [{ item: { kind: 'scene' as const, id: 'x', title: 'X' }, fact: 'Her hand is bandaged.', quote: 'q' }]
    const card = describeTarget(story, 'character:mara', 'scene:x', new Map(), ['Her hand is bandaged.'], about)
    expect(card?.lines).toEqual(['Her hand is bandaged.'])
    expect(card?.developments).toEqual(about)
  })

  test('a variable says its type, its start, and what it means', () => {
    const card = describeTarget(story, 'variable:trust', 'scene:x', new Map())
    expect(card).toMatchObject({ kind: 'variable', title: 'trust', lines: ['number, starts at 0', 'How far Mara trusts Rook.'], images: [] })
  })

  test('a thing the story no longer has gives no card', () => {
    expect(describeTarget(story, 'character:ghost', 'scene:x', new Map())).toBeUndefined()
    expect(describeTarget(story, 'nonsense', 'scene:x', new Map())).toBeUndefined()
  })
})

describe('pageParagraphs', () => {
  test('reads Markdown as plain paragraphs: headings, emphasis, and list markers gone', () => {
    expect(pageParagraphs('### Later\n\nThe **door**-woman, *branded*.\n\n- one\n- two\n\n\n')).toEqual(['Later', 'The door-woman, branded.', '• one • two'])
    expect(pageParagraphs('')).toEqual([])
  })
})
