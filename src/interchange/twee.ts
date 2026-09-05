import type { Scene } from '../domain/types'
import { serializeSceneFile } from '../files/sceneFile'
import { slugify } from '../story/mutations'
import { GLYPHS } from '../ui/glyphs'
import { colorForName } from '../ui/storylineColor'

/**
 * Twee 3, per the IFTF spec. `::` at column 0 opens a passage: a name
 * (backslash-escaped `[ ] { } \` allowed), an optional `[tag tag]`
 * block, an optional inline JSON metadata object. StoryTitle and
 * StoryData are special passages, not story content. Bodies are
 * verbatim — macros belong to a story format, not to this app, so they
 * come through as prose exactly as written.
 */

export interface TwinePassage {
  name: string
  tags: string[]
  /** Twine's editor position, `"x,y"` — carried for fidelity, unused here. */
  position?: string
  body: string
}

export interface TwineStory {
  title?: string
  ifid?: string
  format?: string
  formatVersion?: string
  /** The starting passage's name. */
  start?: string
  passages: TwinePassage[]
}

export interface TwineLink {
  label: string
  target: string
  /** A SugarCube setter link's trailing expression, raw. */
  setter?: string
}

export function parseTwee(text: string): TwineStory {
  const story: TwineStory = { passages: [] }

  const lines = text.split(/\r?\n/)
  let header: string | null = null
  let body: string[] = []
  const finish = () => {
    if (header === null) return
    const { name, tags, position } = splitHeader(header)
    const trimmed = body.join('\n').trim()
    if (name === 'StoryTitle') {
      story.title = trimmed
    } else if (name === 'StoryData') {
      try {
        const data = JSON.parse(trimmed) as {
          ifid?: string
          format?: string
          'format-version'?: string
          start?: string
        }
        story.ifid = data.ifid
        story.format = data.format
        story.formatVersion = data['format-version']
        story.start = data.start
      } catch {
        // Malformed StoryData: the passages still import.
      }
    } else {
      const passage: TwinePassage = { name, tags, body: trimmed }
      if (position !== undefined) passage.position = position
      story.passages.push(passage)
    }
  }

  for (const line of lines) {
    if (line.startsWith('::')) {
      finish()
      header = line.slice(2)
      body = []
    } else if (header !== null) {
      body.push(line)
    }
  }
  finish()

  if (story.start === undefined && story.passages.some((p) => p.name === 'Start')) story.start = 'Start'
  return story
}

/** The first index of `ch` not shielded by a backslash. */
function indexOfUnescaped(text: string, ch: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === ch) return i
  }
  return -1
}

function splitHeader(header: string): { name: string; tags: string[]; position?: string } {
  let rest = header.trim()
  let position: string | undefined

  const brace = indexOfUnescaped(rest, '{')
  if (brace !== -1) {
    try {
      const meta = JSON.parse(rest.slice(brace)) as { position?: string }
      position = meta.position
      rest = rest.slice(0, brace).trim()
    } catch {
      // Not metadata after all — leave it in the name.
    }
  }

  let tags: string[] = []
  const bracket = indexOfUnescaped(rest, '[')
  if (bracket !== -1 && rest.endsWith(']')) {
    tags = rest
      .slice(bracket + 1, -1)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    rest = rest.slice(0, bracket).trim()
  }

  return { name: rest.replace(/\\(.)/g, '$1'), tags, position }
}

/**
 * Every `[[link]]` in a body, in order. The forms are shared across
 * story formats — the Twine editor itself draws its graph from them.
 * Order of checks matters: `->`, then `<-`, then `|`.
 */
export function linksOf(body: string): TwineLink[] {
  const links: TwineLink[] = []
  // The inner text stops at the first `]`, so a setter link's trailing
  // `[expression]` is its own group rather than part of the target.
  const re = /\[\[([^\]]*)\](?:\[([^\]]*)\])?\]/g
  for (let match = re.exec(body); match; match = re.exec(body)) {
    const inner = match[1]
    let split: RegExpMatchArray | null
    let label: string
    let target: string
    if ((split = inner.match(/^(.*?)->(.*)$/))) {
      label = split[1]
      target = split[2]
    } else if ((split = inner.match(/^(.*?)<-(.*)$/))) {
      label = split[2]
      target = split[1]
    } else if ((split = inner.match(/^(.*?)\|(.*)$/))) {
      label = split[1]
      target = split[2]
    } else {
      label = inner
      target = inner
    }
    const link: TwineLink = { label: label.trim(), target: target.trim() }
    if (match[2] !== undefined) link.setter = match[2]
    links.push(link)
  }
  return links
}

/** Passage name → scene slug, collisions resolved in passage order. */
export function passageSlugs(twine: TwineStory): Map<string, string> {
  const slugs = new Map<string, string>()
  const taken = new Set<string>()
  for (const passage of twine.passages) {
    const slug = slugify(passage.name, (s) => taken.has(s))
    taken.add(slug)
    slugs.set(passage.name, slug)
  }
  return slugs
}

/**
 * A Twine story as a story folder: one scene per passage (prose
 * verbatim, macros and all), links as choices, everything on one
 * storyline with the start passage leading. A link to a passage that
 * doesn't exist stays a choice as written — broken links are legal in
 * Twine, and the problems bar will say so here.
 */
export function twineToStoryFiles(twine: TwineStory): Record<string, string> {
  const slugs = passageSlugs(twine)

  const ordered = [...twine.passages]
  const startAt = twine.start === undefined ? -1 : ordered.findIndex((p) => p.name === twine.start)
  if (startAt > 0) ordered.unshift(...ordered.splice(startAt, 1))

  const files: Record<string, string> = {}
  for (const passage of ordered) {
    const slug = slugs.get(passage.name) as string
    const scene: Scene = {
      id: slug,
      title: passage.name,
      storylines: ['imported'],
      tags: passage.tags,
      characters: [],
      images: [],
      effects: [],
      choices: linksOf(passage.body).map((link) => ({
        label: link.label,
        to: slugs.get(link.target) ?? slugify(link.target, () => false),
        effects: [],
      })),
      synopsis: '',
      beats: [],
      prose: passage.body,
    }
    if (passage.position !== undefined) scene.extra = { 'twine-position': passage.position }
    files[`scenes/${slug}.md`] = serializeSceneFile(scene)
  }

  const name = 'Imported'
  const settings: Record<string, unknown> = {}
  if (twine.ifid !== undefined) {
    settings.twine = { ifid: twine.ifid, format: twine.format, formatVersion: twine.formatVersion }
  }
  files['story.json'] = JSON.stringify(
    {
      title: twine.title ?? 'Imported story',
      acts: [],
      storylines: [
        {
          id: 'imported',
          name,
          color: colorForName(name, []),
          glyph: GLYPHS[0],
          scenes: ordered.map((p) => slugs.get(p.name)),
        },
      ],
      settings,
    },
    null,
    2,
  )
  return files
}
