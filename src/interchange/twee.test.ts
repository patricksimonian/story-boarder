import { describe, expect, it } from 'vitest'
import { parseSceneFile } from '../files/sceneFile'
import { linksOf, parseTwee, twineToStoryFiles } from './twee'

/**
 * Twee 3 per the IFTF spec: `::` headers with optional [tags] and inline
 * JSON metadata, StoryTitle and StoryData special passages, and the
 * [[link]] grammar shared by every story format. Macros are not ours to
 * interpret — bodies come through verbatim.
 */

const TWEE = `:: StoryTitle
Embers Under Glass

:: StoryData
{
  "ifid": "6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC",
  "format": "SugarCube",
  "format-version": "2.36.1",
  "start": "Trailhead"
}

:: Trailhead [forest] {"position":"400,200","size":"100,100"}
The trail begins here.

[[An overgrown path]]

:: An overgrown path [forest spooky] {"position":"600,400"}
<<set $torch to true>>
The path disappears into brambles ahead.

[[Push through->Bramble Thicket]]
[[Turn back|Trailhead]]

:: Bramble Thicket
[[Trailhead<-Crawl out]]
[[Rest here]]
`

describe('parseTwee', () => {
  it('splits passages and reads names, tags, and metadata', () => {
    const twine = parseTwee(TWEE)
    expect(twine.passages.map((p) => p.name)).toEqual(['Trailhead', 'An overgrown path', 'Bramble Thicket'])
    const path = twine.passages[1]
    expect(path.tags).toEqual(['forest', 'spooky'])
    expect(path.position).toBe('600,400')
    expect(path.body).toContain('<<set $torch to true>>')
    expect(path.body).toContain('[[Turn back|Trailhead]]')
  })

  it('reads the special passages: title, ifid, format, start', () => {
    const twine = parseTwee(TWEE)
    expect(twine.title).toBe('Embers Under Glass')
    expect(twine.ifid).toBe('6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC')
    expect(twine.format).toBe('SugarCube')
    expect(twine.start).toBe('Trailhead')
  })

  it('unescapes backslashed name characters', () => {
    const twine = parseTwee(':: A \\[bracketed\\] name\nBody here.\n')
    expect(twine.passages[0].name).toBe('A [bracketed] name')
  })

  it('falls back to a passage named Start when StoryData names none', () => {
    const twine = parseTwee(':: Start\nGo.\n\n:: Elsewhere\nStay.\n')
    expect(twine.start).toBe('Start')
    expect(twine.title).toBeUndefined()
  })
})

describe('linksOf', () => {
  it('reads all four link forms', () => {
    expect(linksOf('[[Passage]]')).toEqual([{ label: 'Passage', target: 'Passage' }])
    expect(linksOf('[[Push through->Bramble Thicket]]')).toEqual([
      { label: 'Push through', target: 'Bramble Thicket' },
    ])
    expect(linksOf('[[Trailhead<-Crawl out]]')).toEqual([{ label: 'Crawl out', target: 'Trailhead' }])
    expect(linksOf('[[Turn back|Trailhead]]')).toEqual([{ label: 'Turn back', target: 'Trailhead' }])
  })

  it('keeps a SugarCube setter link’s expression, raw', () => {
    expect(linksOf('[[Take it|Vault][$hasKey to true]]')).toEqual([
      { label: 'Take it', target: 'Vault', setter: '$hasKey to true' },
    ])
  })

  it('finds every link in a body, in order', () => {
    const links = linksOf('One [[A]] two [[B->C]] three.')
    expect(links.map((l) => l.target)).toEqual(['A', 'C'])
  })
})

describe('twineToStoryFiles', () => {
  it('writes a story folder: manifest, one storyline in order, scenes with choices', () => {
    const files = twineToStoryFiles(parseTwee(TWEE))

    const manifest = JSON.parse(files['story.json']) as {
      title: string
      storylines: { name: string; scenes: string[] }[]
      settings: { twine?: { ifid: string; format: string } }
    }
    expect(manifest.title).toBe('Embers Under Glass')
    expect(manifest.storylines).toHaveLength(1)
    // The start passage leads; the rest follow in file order.
    expect(manifest.storylines[0].scenes).toEqual(['trailhead', 'an-overgrown-path', 'bramble-thicket'])
    expect(manifest.settings.twine).toMatchObject({ ifid: '6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC', format: 'SugarCube' })

    const result = parseSceneFile('an-overgrown-path', files['scenes/an-overgrown-path.md'])
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.scene.title).toBe('An overgrown path')
    expect(result.scene.tags).toEqual(['forest', 'spooky'])
    expect(result.scene.prose).toContain('<<set $torch to true>>')
    expect(result.scene.choices).toEqual([
      { label: 'Push through', to: 'bramble-thicket', effects: [] },
      { label: 'Turn back', to: 'trailhead', effects: [] },
    ])
  })

  it('keeps a dangling link as a choice to a scene that does not exist', () => {
    const files = twineToStoryFiles(parseTwee(TWEE))
    const result = parseSceneFile('bramble-thicket', files['scenes/bramble-thicket.md'])
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.scene.choices.map((c) => c.to)).toEqual(['trailhead', 'rest-here'])
    expect(files['scenes/rest-here.md']).toBeUndefined()
  })

  it('keeps colliding passage names apart and links to the right slugs', () => {
    const twee = ':: Alpha!\n[[Alpha?]]\n\n:: Alpha?\nBody.\n'
    const files = twineToStoryFiles(parseTwee(twee))
    const first = parseSceneFile('alpha', files['scenes/alpha.md'])
    if (!first.ok) throw new Error(first.problems.join('; '))
    expect(first.scene.title).toBe('Alpha!')
    expect(first.scene.choices[0].to).toBe('alpha-2')
    const second = parseSceneFile('alpha-2', files['scenes/alpha-2.md'])
    if (!second.ok) throw new Error(second.problems.join('; '))
    expect(second.scene.title).toBe('Alpha?')
  })
})
