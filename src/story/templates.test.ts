import { describe, expect, test } from 'vitest'
import { InMemoryFileAccess } from '../adapters/stubs'
import { analyse } from '../engine/analyse'
import { loadStory } from './loadStory'
import { applyTemplate, TEMPLATES } from './templates'

async function start(template: string) {
  const files = new InMemoryFileAccess()
  await applyTemplate(files, 'Fresh Story', template)
  const result = await loadStory(files)
  if (!result.ok) throw new Error(result.reason)
  return result.loaded
}

describe('starter templates', () => {
  test('three templates exist, each with a name and a blurb', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['three-act', 'branch-and-bottleneck', 'storylet-pool'])
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.blurb.length).toBeGreaterThan(0)
    }
  })

  test('three-act scaffolds three acts and a spine with a scene in each', async () => {
    const loaded = await start('three-act')
    expect(loaded.problems).toEqual([])
    expect(loaded.story.manifest.title).toBe('Fresh Story')
    expect(loaded.story.manifest.acts).toHaveLength(3)
    expect(loaded.story.manifest.storylines).toHaveLength(1)
    const acts = new Set([...loaded.story.scenes.values()].map((s) => s.act))
    for (const act of loaded.story.manifest.acts) expect(acts.has(act.id)).toBe(true)
  })

  test('branch-and-bottleneck scaffolds a fork whose paths rejoin', async () => {
    const loaded = await start('branch-and-bottleneck')
    expect(loaded.problems).toEqual([])
    const fork = [...loaded.story.scenes.values()].find((s) => s.choices.length >= 2)
    expect(fork).toBeDefined()
    const targets = fork!.choices.map((c) => c.to)
    const rejoins = targets.map((t) => loaded.story.scenes.get(t)?.choices.map((c) => c.to))
    expect(rejoins[0]).toEqual(rejoins[1])
  })

  test('storylet-pool scaffolds gated loose scenes over a declared variable, analysis-clean', async () => {
    const loaded = await start('storylet-pool')
    expect(loaded.problems).toEqual([])
    expect(loaded.story.registry.variables.length).toBeGreaterThan(0)
    const storylets = [...loaded.story.scenes.values()].filter(
      (s) => s.storylines.length === 0 && (s.condition !== undefined || s.chance !== undefined),
    )
    expect(storylets.length).toBeGreaterThanOrEqual(2)
    expect(analyse(loaded.story)).toEqual([])
  })

  test('no template still starts a bare story', async () => {
    const files = new InMemoryFileAccess()
    await applyTemplate(files, 'Bare', undefined)
    const result = await loadStory(files)
    expect(result.ok && result.loaded.story.manifest.acts).toEqual([])
  })
})
