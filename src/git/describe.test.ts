import { describe, expect, it } from 'vitest'
import { describeChanges, type FileChange } from './describe'

/**
 * Generated commit messages, spec wording: "Edit scene: The Dry Cistern
 * — prose +240 words, 2 beats added". One phrase per changed file, the
 * first two joined with '; ', the rest folded into '+N more'.
 */

function sceneMd(
  id: string,
  title: string,
  opts: { synopsis?: string; beats?: string[]; prose?: string; condition?: string } = {},
): string {
  const fm = `---\nid: ${id}\n${opts.condition ? `condition: ${opts.condition}\n` : ''}---`
  const beats = (opts.beats ?? []).map((b, i) => `${i + 1}. ${b}`).join('\n')
  return [
    fm,
    `# ${title}`,
    `## Synopsis\n\n${opts.synopsis ?? ''}`,
    `## Beats\n\n${beats}`,
    `## Prose\n\n${opts.prose ?? ''}`,
  ].join('\n\n')
}

function manifest(storylines: { id: string; name: string; scenes?: string[] }[], acts: { id: string; title: string }[] = []): string {
  return JSON.stringify({
    title: 'Embers of the Vault',
    acts,
    storylines: storylines.map((s) => ({ id: s.id, name: s.name, color: '#5b6ee1', glyph: '◆', scenes: s.scenes ?? [] })),
    settings: {},
  })
}

const change = (path: string, before: string | null, after: string | null): FileChange => ({ path, before, after })

describe('scene phrases', () => {
  it('names a new scene', () => {
    expect(describeChanges([change('scenes/rooftop-duel.md', null, sceneMd('rooftop-duel', 'Rooftop Duel'))])).toBe(
      'New scene: Rooftop Duel',
    )
  })

  it('names a deleted scene by the title it had', () => {
    expect(describeChanges([change('scenes/rooftop-duel.md', sceneMd('rooftop-duel', 'Rooftop Duel'), null)])).toBe(
      'Delete scene: Rooftop Duel',
    )
  })

  it('measures prose growth in words', () => {
    const before = sceneMd('cistern', 'The Dry Cistern', { prose: 'Mara talks first.' })
    const after = sceneMd('cistern', 'The Dry Cistern', { prose: 'Mara talks first. Dax listens.' })
    expect(describeChanges([change('scenes/cistern.md', before, after)])).toBe(
      'Edit scene: The Dry Cistern — prose +2 words',
    )
  })

  it('speaks singular for one word lost', () => {
    const before = sceneMd('cistern', 'The Dry Cistern', { prose: 'Mara talks first.' })
    const after = sceneMd('cistern', 'The Dry Cistern', { prose: 'Mara talks.' })
    expect(describeChanges([change('scenes/cistern.md', before, after)])).toBe(
      'Edit scene: The Dry Cistern — prose -1 word',
    )
  })

  it('counts beats added and removed', () => {
    const two = sceneMd('cistern', 'The Dry Cistern', { beats: ['A', 'B'] })
    const four = sceneMd('cistern', 'The Dry Cistern', { beats: ['A', 'B', 'C', 'D'] })
    expect(describeChanges([change('scenes/cistern.md', two, four)])).toBe(
      'Edit scene: The Dry Cistern — 2 beats added',
    )
    const one = sceneMd('cistern', 'The Dry Cistern', { beats: ['A'] })
    expect(describeChanges([change('scenes/cistern.md', two, one)])).toBe(
      'Edit scene: The Dry Cistern — 1 beat removed',
    )
  })

  it('calls reworded beats edited', () => {
    const before = sceneMd('cistern', 'The Dry Cistern', { beats: ['A', 'B'] })
    const after = sceneMd('cistern', 'The Dry Cistern', { beats: ['A', 'B sharpened'] })
    expect(describeChanges([change('scenes/cistern.md', before, after)])).toBe(
      'Edit scene: The Dry Cistern — beats edited',
    )
  })

  it('lists prose, beats, synopsis, and engine together', () => {
    const before = sceneMd('cistern', 'The Dry Cistern', { synopsis: 'Old.', beats: ['A'], prose: 'One.' })
    const after = sceneMd('cistern', 'The Dry Cistern', {
      synopsis: 'New.',
      beats: ['A', 'B'],
      prose: 'One two three.',
      condition: 'trust >= 1',
    })
    expect(describeChanges([change('scenes/cistern.md', before, after)])).toBe(
      'Edit scene: The Dry Cistern — prose +2 words, 1 beat added, synopsis edited, engine changed',
    )
  })

  it('notes a retitle', () => {
    const before = sceneMd('cistern', 'The Dry Cistern')
    const after = sceneMd('cistern', 'The Cistern Runs Dry')
    expect(describeChanges([change('scenes/cistern.md', before, after)])).toBe(
      'Edit scene: The Cistern Runs Dry — retitled',
    )
  })

  it('says just Edit scene when only formatting moved', () => {
    const before = sceneMd('cistern', 'The Dry Cistern', { prose: 'Same words.' })
    const after = `${sceneMd('cistern', 'The Dry Cistern', { prose: 'Same words.' })}\n`
    expect(describeChanges([change('scenes/cistern.md', before, after)])).toBe('Edit scene: The Dry Cistern')
  })
})

describe('structure and registry phrases', () => {
  it('names storylines and acts that come and go', () => {
    const before = manifest([{ id: 'heist', name: 'The Heist' }])
    const after = manifest([{ id: 'heist', name: 'The Heist' }, { id: 'rebellion', name: 'The Rebellion' }])
    expect(describeChanges([change('story.json', before, after)])).toBe('New storyline: The Rebellion')

    const actAfter = manifest([{ id: 'heist', name: 'The Heist' }], [{ id: 'act-1', title: 'Act I' }])
    expect(describeChanges([change('story.json', before, actAfter)])).toBe('New act: Act I')
  })

  it('calls a reorder rearranging the board', () => {
    const before = manifest([{ id: 'heist', name: 'The Heist', scenes: ['a', 'b'] }])
    const after = manifest([{ id: 'heist', name: 'The Heist', scenes: ['b', 'a'] }])
    expect(describeChanges([change('story.json', before, after)])).toBe('Rearrange the board')
  })

  it('calls a settings-only change story settings', () => {
    const before = manifest([{ id: 'heist', name: 'The Heist' }])
    const withSync = JSON.parse(before) as { settings: Record<string, unknown> }
    withSync.settings = { sync: { owner: 'pat', repo: 'story' } }
    expect(describeChanges([change('story.json', before, JSON.stringify(withSync))])).toBe('Story settings')
  })

  it('names variables that come and go', () => {
    const before = JSON.stringify({ variables: [] })
    const after = JSON.stringify({ variables: [{ id: 'trust', type: 'number', initial: 0 }] })
    expect(describeChanges([change('variables.json', before, after)])).toBe('New variable: trust')
    expect(describeChanges([change('variables.json', after, before)])).toBe('Delete variable: trust')
  })
})

describe('the rest of the folder', () => {
  it('names references by kind and title', () => {
    const mara = '---\nid: mara\n---\n\n# Mara\n\nThe door-woman.\n'
    expect(describeChanges([change('characters/mara.md', null, mara)])).toBe('New character: Mara')
    expect(describeChanges([change('characters/mara.md', mara, `${mara}More.\n`)])).toBe('Edit character: Mara')
    expect(describeChanges([change('places/underhive.md', null, '# The Underhive\n')])).toBe('New place: The Underhive')
    expect(describeChanges([change('notes/vault-timeline.md', null, '---\nid: vault-timeline\n---\n\n# Vault Timeline\n')])).toBe(
      'New note: Vault Timeline',
    )
  })

  it('names playthroughs', () => {
    const run = JSON.stringify({ name: 'Dry run', steps: [] })
    expect(describeChanges([change('playthroughs/dry-run.json', null, run)])).toBe('Save playthrough: Dry run')
    expect(describeChanges([change('playthroughs/dry-run.json', run, null)])).toBe('Delete playthrough: Dry run')
  })

  it('falls back to the path for files it has no name for', () => {
    expect(describeChanges([change('notes.txt', null, 'jot')])).toBe('Add notes.txt')
    expect(describeChanges([change('notes.txt', 'jot', 'jotted')])).toBe('Edit notes.txt')
  })
})

describe('joining', () => {
  const sceneEdit = change(
    'scenes/cistern.md',
    sceneMd('cistern', 'The Dry Cistern', { prose: 'One.' }),
    sceneMd('cistern', 'The Dry Cistern', { prose: 'One two three.' }),
  )
  const newStoryline = change(
    'story.json',
    manifest([{ id: 'heist', name: 'The Heist' }]),
    manifest([{ id: 'heist', name: 'The Heist' }, { id: 'rebellion', name: 'The Rebellion' }]),
  )

  it('joins two phrases with a semicolon', () => {
    expect(describeChanges([sceneEdit, newStoryline])).toBe(
      'Edit scene: The Dry Cistern — prose +2 words; New storyline: The Rebellion',
    )
  })

  it('folds a crowd into +N more', () => {
    const extras = [
      change('notes.txt', null, 'a'),
      change('ideas.txt', null, 'b'),
      change('scraps.txt', null, 'c'),
    ]
    expect(describeChanges([sceneEdit, newStoryline, ...extras])).toBe(
      'Edit scene: The Dry Cistern — prose +2 words; New storyline: The Rebellion; +3 more',
    )
  })
})
