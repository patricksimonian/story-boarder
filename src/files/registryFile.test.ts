import { describe, expect, test } from 'vitest'
import { parseRegistryFile } from './registryFile'

describe('parseRegistryFile', () => {
  test('reads typed variables', () => {
    const result = parseRegistryFile(
      JSON.stringify({
        variables: [
          { id: 'trust', type: 'number', initial: 0 },
          { id: 'mara_alive', type: 'boolean', initial: true },
          { id: 'city_mood', type: 'enum', values: ['calm', 'tense', 'rioting'], initial: 'calm' },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.registry.variables).toHaveLength(3)
    expect(result.registry.variables[2]).toEqual({
      id: 'city_mood',
      type: 'enum',
      values: ['calm', 'tense', 'rioting'],
      initial: 'calm',
    })
  })

  test('a description rides along and its absence stays absent', () => {
    const result = parseRegistryFile(
      JSON.stringify({
        variables: [
          { id: 'plants_saved', type: 'number', initial: 0, description: 'How many saplings Dalia strengthened on her walk.' },
          { id: 'trust', type: 'number', initial: 0 },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.registry.variables[0].description).toBe('How many saplings Dalia strengthened on her walk.')
    expect('description' in result.registry.variables[1]).toBe(false)
  })

  test('flags a mistyped initial and an enum initial outside its values', () => {
    const result = parseRegistryFile(
      JSON.stringify({
        variables: [
          { id: 'trust', type: 'number', initial: 'lots' },
          { id: 'mood', type: 'enum', values: ['calm'], initial: 'rioting' },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.join('\n')).toMatch(/trust/)
      expect(result.problems.join('\n')).toMatch(/rioting/)
    }
  })

  test('flags duplicate variable ids', () => {
    const result = parseRegistryFile(
      JSON.stringify({
        variables: [
          { id: 'trust', type: 'number', initial: 0 },
          { id: 'trust', type: 'boolean', initial: false },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]).toMatch(/duplicate/i)
  })
})
