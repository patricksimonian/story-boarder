import { describe, expect, test } from 'vitest'
import { parseVerdicts, samePhrase, serializeVerdicts, withVerdict, withoutVerdict, type VerdictStore } from './verdicts'

describe('mentions.json', () => {
  test('round-trips, items sorted, empty items dropped', () => {
    const store: VerdictStore = {
      'scene:cold-city': [{ quote: 'Rook', entity: null, by: 'writer' }],
      'note:plan': [{ quote: 'the smith', entity: 'character:rook', by: 'writer' }],
      'scene:empty': [],
    }
    const text = serializeVerdicts(store)
    expect(text.startsWith('{\n  "note:plan"')).toBe(true)
    const parsed = parseVerdicts(text)
    expect(parsed).toEqual({
      ok: true,
      store: {
        'note:plan': [{ quote: 'the smith', entity: 'character:rook', by: 'writer' }],
        'scene:cold-city': [{ quote: 'Rook', entity: null, by: 'writer' }],
      },
    })
  })

  test('a hand-edited file is flagged, never half-read', () => {
    expect(parseVerdicts('nope').ok).toBe(false)
    expect(parseVerdicts('[]').ok).toBe(false)
    const result = parseVerdicts('{"scene:x": [{"quote": "", "entity": null}, {"quote": "Rook", "entity": "rook"}], "scene:y": 3}')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toEqual([
      '`scene:x` verdict 1 has no quote',
      '`scene:x` verdict "Rook" names no entity (expected `kind:id` or null)',
      '`scene:y` must hold a list of verdicts',
    ])
  })

  test('a missing `by` reads as the writer, since the file is theirs', () => {
    const result = parseVerdicts('{"scene:x": [{"quote": "Rook", "entity": null}]}')
    expect(result).toEqual({ ok: true, store: { 'scene:x': [{ quote: 'Rook', entity: null, by: 'writer' }] } })
  })
})

describe('editing the store', () => {
  test('a new verdict on the same phrase replaces the old one, case and possessive aside', () => {
    let store: VerdictStore = {}
    store = withVerdict(store, 'scene:x', { quote: "Rook's", entity: null, by: 'writer' })
    store = withVerdict(store, 'scene:x', { quote: 'rook', entity: 'character:rook', by: 'writer' })
    expect(store).toEqual({ 'scene:x': [{ quote: 'rook', entity: 'character:rook', by: 'writer' }] })
    store = withoutVerdict(store, 'scene:x', 'ROOK')
    expect(store).toEqual({})
  })

  test('same phrase', () => {
    expect(samePhrase('the Vault’s', "The vault's")).toBe(true)
    expect(samePhrase('Rook', 'Rooks')).toBe(false)
  })
})
