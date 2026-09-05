import { describe, expect, test } from 'vitest'
import type { VariableRegistry } from '../domain/types'
import { applyEffect, checkCondition, checkEffect, evaluate, parseCondition, parseEffect } from './expr'

const registry: VariableRegistry = {
  variables: [
    { id: 'trust', type: 'number', initial: 0 },
    { id: 'mara_alive', type: 'boolean', initial: true },
    { id: 'city_mood', type: 'enum', values: ['calm', 'tense', 'rioting'], initial: 'calm' },
  ],
}
const initial = { trust: 0, mara_alive: true, city_mood: 'calm' }

function condition(source: string) {
  const result = parseCondition(source)
  if (!result.ok) throw new Error(result.error.message)
  return result.ast
}

describe('conditions', () => {
  test('a comparison and boolean logic evaluate against state', () => {
    expect(evaluate(condition('trust >= 3 and not mara_alive'), { ...initial, trust: 3, mara_alive: false })).toBe(true)
    expect(evaluate(condition('trust >= 3 and not mara_alive'), { ...initial, trust: 3 })).toBe(false)
    expect(evaluate(condition('trust > 2 or mara_alive'), initial)).toBe(true)
  })

  test('a bare boolean variable is a condition on its own', () => {
    expect(evaluate(condition('mara_alive'), initial)).toBe(true)
  })

  test('enum values are bare names or quoted strings', () => {
    expect(evaluate(condition('city_mood == tense'), { ...initial, city_mood: 'tense' })).toBe(true)
    expect(evaluate(condition("city_mood != 'calm'"), initial)).toBe(false)
  })

  test('and binds tighter than or; parentheses override', () => {
    expect(evaluate(condition('mara_alive or trust > 0 and trust < 0'), initial)).toBe(true)
    expect(evaluate(condition('(mara_alive or trust > 0) and trust < 0'), initial)).toBe(false)
  })

  test('arithmetic inside comparisons', () => {
    expect(evaluate(condition('trust + 2 >= 2'), initial)).toBe(true)
    expect(evaluate(condition('trust * 2 - 1 == -1'), initial)).toBe(true)
  })

  test('a syntax error says where', () => {
    const result = parseCondition('trust >= ')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/expected a value/i)
    expect(result.error.at).toBe(9)
  })

  test('the registry check names an unknown variable and a type mismatch', () => {
    expect(checkCondition(condition('trusst >= 1'), registry)).toEqual(['`trusst` is not a registered variable'])
    expect(checkCondition(condition('trust == true'), registry)).toEqual(['`trust` is a number, but it is compared with a boolean'])
    expect(checkCondition(condition('city_mood == furious'), registry)).toEqual([
      '`furious` is not one of city_mood’s values (calm, tense, rioting)',
    ])
    expect(checkCondition(condition('trust'), registry)).toEqual(['A condition must be true or false; `trust` is a number'])
    expect(checkCondition(condition('trust >= 3 and not mara_alive'), registry)).toEqual([])
  })
})

describe('effects', () => {
  test('assignments, increments, and decrements change state', () => {
    const inc = parseEffect('trust += 2')
    const set = parseEffect('mara_alive = false')
    const dec = parseEffect('trust -= 1')
    if (!inc.ok || !set.ok || !dec.ok) throw new Error('parse failed')
    let state = applyEffect(inc.ast, initial)
    state = applyEffect(set.ast, state)
    state = applyEffect(dec.ast, state)
    expect(state).toEqual({ trust: 1, mara_alive: false, city_mood: 'calm' })
  })

  test('an effect can compute from other variables and set an enum', () => {
    const fx = parseEffect('trust = trust + 10')
    const mood = parseEffect('city_mood = rioting')
    if (!fx.ok || !mood.ok) throw new Error('parse failed')
    expect(applyEffect(mood.ast, applyEffect(fx.ast, { ...initial, trust: 5 }))).toEqual({
      trust: 15,
      mara_alive: true,
      city_mood: 'rioting',
    })
  })

  test('the registry check catches a wrong-typed assignment and a += on a boolean', () => {
    const bad = parseEffect('mara_alive = 3')
    const plus = parseEffect('mara_alive += 1')
    const unknown = parseEffect('rebellion += 1')
    if (!bad.ok || !plus.ok || !unknown.ok) throw new Error('parse failed')
    expect(checkEffect(bad.ast, registry)).toEqual(['`mara_alive` is a boolean, but it is assigned a number'])
    expect(checkEffect(plus.ast, registry)).toEqual(['`+=` only works on a number; `mara_alive` is a boolean'])
    expect(checkEffect(unknown.ast, registry)).toEqual(['`rebellion` is not a registered variable'])
  })

  test('an effect needs an assignment', () => {
    const result = parseEffect('trust >= 1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/expected =, \+=, or -=/i)
  })
})
