import { describe, expect, test } from 'vitest'
import { parseSceneFile, serializeSceneFile } from './sceneFile'

const JOB_OFFER = `---
id: the-job-offer
storylines: [main, mara]
act: act-1
tags: [heist, introduction]
characters: [rook, dax, mara]
condition: trust >= 1
effects:
  - trust = 1
  - do: rebellion_strength += 1
    anchor: 2
choices:
  - label: Trust Mara with the final tumbler
    to: embers
    condition: trust >= 4
    effects: [mara_alive = true]
---

# The Job Offer

## Synopsis

In the back room of the Brass Lamp, Dax lays out the Vault job.

## Beats

1. The Vault has never been opened while the city stood.
2. Mara agrees before hearing the cut — too fast.

## Prose

The back room of the Brass Lamp smelled of lamp oil and older lies.

Dax spread the requisition flat with two fingers.
`

describe('scene images', () => {
  test('ride the frontmatter and round-trip', () => {
    const result = parseSceneFile(
      'rooftop-duel',
      '---\nid: rooftop-duel\nimages: [assets/rooftop-storm.png]\n---\n\n# Rooftop Duel\n',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scene.images).toEqual(['assets/rooftop-storm.png'])
    const text = serializeSceneFile(result.scene)
    expect(text).toContain('assets/rooftop-storm.png')
    const again = parseSceneFile('rooftop-duel', text)
    expect(again.ok && again.scene).toEqual(result.scene)
  })

  test('a scene without images serializes none', () => {
    const result = parseSceneFile('bare', '---\nid: bare\n---\n\n# Bare\n')
    expect(result.ok && result.scene.images).toEqual([])
    if (result.ok) expect(serializeSceneFile(result.scene)).not.toContain('images')
  })
})

describe('parseSceneFile', () => {
  test('reads a full scene from frontmatter and body sections', () => {
    const result = parseSceneFile('the-job-offer', JOB_OFFER)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const scene = result.scene
    expect(scene.id).toBe('the-job-offer')
    expect(scene.title).toBe('The Job Offer')
    expect(scene.storylines).toEqual(['main', 'mara'])
    expect(scene.act).toBe('act-1')
    expect(scene.tags).toEqual(['heist', 'introduction'])
    expect(scene.characters).toEqual(['rook', 'dax', 'mara'])
    expect(scene.condition).toBe('trust >= 1')
    expect(scene.effects).toEqual([
      { source: 'trust = 1' },
      { source: 'rebellion_strength += 1', anchor: 2 },
    ])
    expect(scene.choices).toEqual([
      {
        label: 'Trust Mara with the final tumbler',
        to: 'embers',
        condition: 'trust >= 4',
        effects: [{ source: 'mara_alive = true' }],
      },
    ])
    expect(scene.synopsis).toBe(
      'In the back room of the Brass Lamp, Dax lays out the Vault job.',
    )
    expect(scene.beats).toEqual([
      'The Vault has never been opened while the city stood.',
      'Mara agrees before hearing the cut — too fast.',
    ])
    expect(scene.prose).toBe(
      'The back room of the Brass Lamp smelled of lamp oil and older lies.\n\nDax spread the requisition flat with two fingers.',
    )
  })

  test('a loose scene needs only frontmatter id and a title', () => {
    const result = parseSceneFile(
      'rooftop-duel',
      '---\nid: rooftop-duel\n---\n\n# Rooftop Duel\n',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scene.storylines).toEqual([])
    expect(result.scene.act).toBeUndefined()
    expect(result.scene.condition).toBeUndefined()
    expect(result.scene.beats).toEqual([])
    expect(result.scene.synopsis).toBe('')
    expect(result.scene.prose).toBe('')
  })
})
