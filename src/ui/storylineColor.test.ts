import { describe, expect, test } from 'vitest'
import { colorForName, hueOf } from './storylineColor'

describe('colorForName', () => {
  test('is a stable hex color for a given name', () => {
    const first = colorForName('The Rebellion', [])
    expect(first).toMatch(/^#[0-9a-f]{6}$/)
    expect(colorForName('The Rebellion', [])).toBe(first)
  })

  test('different names give different colors', () => {
    expect(colorForName('The Heist', [])).not.toBe(colorForName("Mara's Trust", []))
  })

  test('steers clear of hues already in use', () => {
    const taken = colorForName('The Heist', [])
    const nudged = colorForName('The Heist', [taken])
    expect(nudged).not.toBe(taken)
    const apart = Math.abs(hueOf(nudged) - hueOf(taken))
    expect(Math.min(apart, 360 - apart)).toBeGreaterThanOrEqual(30)
  })
})
