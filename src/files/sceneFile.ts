import { stringify } from 'yaml'
import type { Choice, Effect, Scene, Slug } from '../domain/types'
import { readSections, readTitle, splitFrontmatter } from './frontmatter'

export type SceneParseResult =
  | { ok: true; scene: Scene }
  | { ok: false; problems: string[] }

/**
 * Parses one `scenes/<slug>.md`. Anything that doesn't hold together is
 * reported as a problem, never repaired — the file gets flagged and edited
 * raw. Missing sections are not problems: a new scene has no prose yet.
 */
export function parseSceneFile(slug: Slug, text: string): SceneParseResult {
  const problems: string[] = []
  const split = splitFrontmatter(text)
  if (!split.ok) return { ok: false, problems: [split.problem] }

  const fm = asRecord(split.data)
  if (!fm) return { ok: false, problems: ['Frontmatter must be a YAML mapping'] }

  if (fm.id === undefined) problems.push('Frontmatter is missing `id`')
  else if (fm.id !== slug) problems.push(`Frontmatter id \`${String(fm.id)}\` doesn't match the filename \`${slug}\``)

  const title = readTitle(split.body)
  if (title === undefined) problems.push('Body has no `# Title` heading')

  const storylines = stringList(fm.storylines, 'storylines', problems) ?? []
  const tags = stringList(fm.tags, 'tags', problems) ?? []
  const characters = stringList(fm.characters, 'characters', problems) ?? []
  const images = stringList(fm.images, 'images', problems) ?? []
  const act = optionalString(fm.act, 'act', problems)
  const condition = optionalString(fm.condition, 'condition', problems)
  const chance = optionalNumber(fm.chance, 'chance', problems)
  const effects = effectList(fm.effects, 'effects', problems)
  const choices = choiceList(fm.choices, problems)

  const sections = readSections(split.body)
  const synopsis = sections.get('synopsis') ?? ''
  const prose = sections.get('prose') ?? ''
  const beats = parseBeats(sections.get('beats') ?? '')

  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fm)) {
    if (!KNOWN_FIELDS.has(key)) extra[key] = value
  }

  if (problems.length) return { ok: false, problems }
  const scene: Scene = {
    id: slug,
    title: title as string,
    storylines,
    act,
    tags,
    characters,
    condition,
    effects,
    choices,
    chance,
    synopsis,
    beats,
    prose,
    images,
  }
  if (Object.keys(extra).length) scene.extra = extra
  return { ok: true, scene }
}

const KNOWN_FIELDS = new Set([
  'id',
  'storylines',
  'act',
  'tags',
  'characters',
  'condition',
  'effects',
  'choices',
  'chance',
  'images',
])

/** Writes a scene as its on-disk Markdown. Empty fields stay out of the frontmatter. */
export function serializeSceneFile(scene: Scene): string {
  const fm: Record<string, unknown> = { id: scene.id }
  if (scene.storylines.length) fm.storylines = scene.storylines
  if (scene.act !== undefined) fm.act = scene.act
  if (scene.tags.length) fm.tags = scene.tags
  if (scene.characters.length) fm.characters = scene.characters
  if (scene.condition !== undefined) fm.condition = scene.condition
  if (scene.effects.length) fm.effects = scene.effects.map(effectOut)
  if (scene.choices.length) fm.choices = scene.choices.map(choiceOut)
  if (scene.chance !== undefined) fm.chance = scene.chance
  if (scene.images.length) fm.images = scene.images
  for (const [key, value] of Object.entries(scene.extra ?? {})) {
    if (!KNOWN_FIELDS.has(key)) fm[key] = value
  }

  const beats = scene.beats.map((beat, i) => `${i + 1}. ${beat}`).join('\n')
  return [
    `---\n${stringify(fm)}---`,
    `# ${scene.title}`,
    `## Synopsis${block(scene.synopsis)}`,
    `## Beats${block(beats)}`,
    `## Prose${block(scene.prose)}`,
  ].join('\n\n')
}

function block(content: string): string {
  return content === '' ? '' : `\n\n${content}`
}

function effectOut(effect: Effect): unknown {
  return effect.anchor === undefined
    ? effect.source
    : { do: effect.source, anchor: effect.anchor }
}

function choiceOut(choice: Choice): Record<string, unknown> {
  const out: Record<string, unknown> = { label: choice.label, to: choice.to }
  if (choice.condition !== undefined) out.condition = choice.condition
  if (choice.effects.length) out.effects = choice.effects.map(effectOut)
  if (choice.chance !== undefined) out.chance = choice.chance
  return out
}

/** Beats are the list items of the `## Beats` section, in order. */
function parseBeats(section: string): string[] {
  const beats: string[] = []
  for (const line of section.split('\n')) {
    const match = line.match(/^(?:\d+[.)]|[-*]) +(.*)$/)
    if (match) beats.push(match[1].trim())
  }
  return beats
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function optionalString(value: unknown, field: string, problems: string[]): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    problems.push(`\`${field}\` must be a string`)
    return undefined
  }
  return value
}

function optionalNumber(value: unknown, field: string, problems: string[]): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`\`${field}\` must be a number`)
    return undefined
  }
  return value
}

function stringList(value: unknown, field: string, problems: string[]): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    problems.push(`\`${field}\` must be a list of strings`)
    return undefined
  }
  return value as string[]
}

/** An effect is a plain string, or a map `{ do, anchor }` citing a beat number. */
function effectList(value: unknown, field: string, problems: string[]): Effect[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    problems.push(`\`${field}\` must be a list`)
    return []
  }
  const effects: Effect[] = []
  value.forEach((entry, i) => {
    if (typeof entry === 'string') {
      effects.push({ source: entry })
      return
    }
    const record = asRecord(entry)
    if (record && typeof record.do === 'string') {
      const anchor = optionalNumber(record.anchor, `${field}[${i}].anchor`, problems)
      effects.push(anchor === undefined ? { source: record.do } : { source: record.do, anchor })
      return
    }
    problems.push(`\`${field}[${i}]\` must be a string or a \`{ do, anchor }\` map`)
  })
  return effects
}

function choiceList(value: unknown, problems: string[]): Choice[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    problems.push('`choices` must be a list')
    return []
  }
  const choices: Choice[] = []
  value.forEach((entry, i) => {
    const record = asRecord(entry)
    if (!record || typeof record.label !== 'string' || typeof record.to !== 'string') {
      problems.push(`\`choices[${i}]\` needs at least \`label\` and \`to\``)
      return
    }
    const choice: Choice = { label: record.label, to: record.to, effects: effectList(record.effects, `choices[${i}].effects`, problems) }
    const condition = optionalString(record.condition, `choices[${i}].condition`, problems)
    if (condition !== undefined) choice.condition = condition
    const chance = optionalNumber(record.chance, `choices[${i}].chance`, problems)
    if (chance !== undefined) choice.chance = chance
    choices.push(choice)
  })
  return choices
}
