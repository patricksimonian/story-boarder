import { describe, expect, it } from 'vitest'
import { parseTwineHtml } from './twine-html'

/**
 * Published Twine HTML per the IFTF output spec: a `<tw-storydata>`
 * island, passages as `<tw-passagedata>` with entity-escaped source —
 * parsed with a real DOM parser and read as textContent, never by
 * regexing bytes. An archive is the same islands concatenated; every
 * one imports.
 */

const STORY = `<tw-storydata name="Embers Under Glass" startnode="2" creator="Twine"
  ifid="6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC" format="SugarCube" format-version="2.36.1" zoom="1" hidden>
<tw-passagedata pid="1" name="An overgrown path" tags="forest spooky" position="600,400" size="100,100">&lt;&lt;set $torch to true&gt;&gt;
The path disappears into brambles ahead.

[[Push through-&gt;Bramble Thicket]]</tw-passagedata>
<tw-passagedata pid="2" name="Trailhead" tags="" position="400,200" size="100,100">The trail begins here.

[[An overgrown path]]</tw-passagedata>
</tw-storydata>`

describe('parseTwineHtml', () => {
  it('reads the island: title, ifid, format, and the start passage by name', () => {
    const stories = parseTwineHtml(`<html><body>${STORY}</body></html>`)
    expect(stories).toHaveLength(1)
    const story = stories[0]
    expect(story.title).toBe('Embers Under Glass')
    expect(story.ifid).toBe('6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC')
    expect(story.format).toBe('SugarCube')
    expect(story.formatVersion).toBe('2.36.1')
    // startnode is a pid; the name is the real key.
    expect(story.start).toBe('Trailhead')
  })

  it('unescapes passage sources and splits tags', () => {
    const [story] = parseTwineHtml(STORY)
    expect(story.passages.map((p) => p.name)).toEqual(['An overgrown path', 'Trailhead'])
    const path = story.passages[0]
    expect(path.tags).toEqual(['forest', 'spooky'])
    expect(path.position).toBe('600,400')
    expect(path.body).toContain('<<set $torch to true>>')
    expect(path.body).toContain('[[Push through->Bramble Thicket]]')
    expect(story.passages[1].tags).toEqual([])
  })

  it('imports every story in an archive', () => {
    const second = STORY.replace('Embers Under Glass', 'Second Story').replace(
      '6D509890-1CA5-49DF-BFB6-5CA35B8DE2AC',
      'AAAAAAAA-1111-2222-3333-444444444444',
    )
    const stories = parseTwineHtml(`${STORY}\n${second}`)
    expect(stories.map((s) => s.title)).toEqual(['Embers Under Glass', 'Second Story'])
    expect(stories[1].ifid).toBe('AAAAAAAA-1111-2222-3333-444444444444')
  })

  it('reads nothing from a page with no island', () => {
    expect(parseTwineHtml('<html><body><p>Just a page.</p></body></html>')).toEqual([])
  })
})
