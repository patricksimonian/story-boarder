import type { TwinePassage, TwineStory } from './twee'

/**
 * Published Twine HTML and archives, per the IFTF output spec. The
 * story lives in a `<tw-storydata>` island whose passage sources are
 * entity-escaped — so this parses with a real DOM parser and reads
 * textContent, never regexing raw bytes. An archive is just more than
 * one island in the same file; every one is returned.
 */
export function parseTwineHtml(html: string): TwineStory[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return [...doc.querySelectorAll('tw-storydata')].map((island) => {
    const passages: TwinePassage[] = [...island.querySelectorAll('tw-passagedata')].map((el) => {
      const passage: TwinePassage = {
        name: el.getAttribute('name') ?? '',
        tags: (el.getAttribute('tags') ?? '')
          .trim()
          .split(/\s+/)
          .filter(Boolean),
        body: (el.textContent ?? '').trim(),
      }
      const position = el.getAttribute('position')
      if (position) passage.position = position
      return passage
    })

    const story: TwineStory = { passages }
    const title = island.getAttribute('name')
    if (title) story.title = title
    const ifid = island.getAttribute('ifid')
    if (ifid) story.ifid = ifid
    const format = island.getAttribute('format')
    if (format) story.format = format
    const formatVersion = island.getAttribute('format-version')
    if (formatVersion) story.formatVersion = formatVersion

    // startnode names a pid, and pids are file-local — resolve to the
    // passage's name, the identity links actually use.
    const startnode = island.getAttribute('startnode')
    const startEl = startnode === null ? null : island.querySelector(`tw-passagedata[pid="${startnode}"]`)
    const start = startEl?.getAttribute('name')
    if (start) story.start = start
    else if (passages.some((p) => p.name === 'Start')) story.start = 'Start'

    return story
  })
}
