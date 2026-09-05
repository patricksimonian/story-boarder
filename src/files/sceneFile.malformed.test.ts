import { describe, expect, test } from 'vitest'
import { parseSceneFile } from './sceneFile'

function problemsOf(slug: string, text: string): string[] {
  const result = parseSceneFile(slug, text)
  expect(result.ok).toBe(false)
  return result.ok ? [] : result.problems
}

describe('parseSceneFile flags malformed files', () => {
  test('no frontmatter block', () => {
    expect(problemsOf('x', '# Just a title\n')[0]).toMatch(/frontmatter/i)
  })

  test('unclosed frontmatter', () => {
    expect(problemsOf('x', '---\nid: x\n')[0]).toMatch(/close/i)
  })

  test('broken YAML', () => {
    expect(problemsOf('x', '---\nid: [unclosed\n---\n# T\n')[0]).toMatch(/YAML/i)
  })

  test('id missing or disagreeing with the filename', () => {
    expect(problemsOf('x', '---\ntags: []\n---\n# T\n')[0]).toMatch(/missing `id`/i)
    expect(problemsOf('x', '---\nid: y\n---\n# T\n')[0]).toMatch(/doesn't match the filename/i)
  })

  test('missing title heading', () => {
    expect(problemsOf('x', '---\nid: x\n---\nno heading here\n')[0]).toMatch(/# Title/i)
  })

  test('wrongly-typed fields are each reported', () => {
    const problems = problemsOf(
      'x',
      '---\nid: x\nstorylines: main\nchance: often\nchoices:\n  - to: somewhere\n---\n# T\n',
    )
    expect(problems).toHaveLength(3)
    expect(problems.join('\n')).toMatch(/storylines/)
    expect(problems.join('\n')).toMatch(/chance/)
    expect(problems.join('\n')).toMatch(/choices\[0\]/)
  })
})
