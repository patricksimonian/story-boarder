import type { Slug, Story, TargetKey, VariableState } from '../domain/types'
import { startSimulation, take } from '../engine/simulate'
import { dictionary, findMentions, itemText, type Dictionary } from '../mentions/match'
import { targetKey } from '../mentions/verdicts'
import type { JsonSchema, WorkflowRequest } from './claudeCode'
import { GLOSSARY } from './glossary'
import type { Ledger } from './ledger'

/**
 * The continuity check: the synthesis stage over one storyline. Its
 * briefing is the world as the library and notebook hold it — only the
 * pages and notes that bear on this lane, chosen by who is actually
 * named in it — then the lane's scenes in order with the variable state
 * the engine holds at each, what the reads recorded, and, for a scene
 * not read yet, its own synopsis, beats, and prose. Its output is
 * contradictions a writer would nod at, each end quoted.
 */

export const CHECK_CONTINUITY = 'check-continuity'

export interface ContinuityOutput {
  contradictions: { message: string; evidence: { scene: string; quote: string }[] }[]
}

export interface ContinuityFinding {
  id: string
  storyline: Slug
  message: string
  evidence: { scene: Slug; quote: string }[]
}

export const CONTINUITY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: { scene: { type: 'string' }, quote: { type: 'string' } },
              required: ['scene', 'quote'],
              additionalProperties: false,
            },
          },
        },
        required: ['message', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['contradictions'],
  additionalProperties: false,
}

export const CONTINUITY_RUBRIC = `You check one storyline of a writer's story for continuity, for a writing tool. You never write prose, never suggest changes, and never invent.

You are given the world first: the library's pages for the characters, places, and lore this storyline touches, and the notebook's notes that bear on them. These are the settled facts as the writer keeps them — who someone is, what a place is, what the rules are. Then the storyline's scenes in order. For each: the variable state the story engine holds on entering it, the writer's synopsis and beats, and either the developments a reading of that scene recorded (facts about the story world, each with the writer's sentence as evidence) or, when the scene has not been read, its prose.

A contradiction is two things that cannot both hold on this path: a scene against an earlier scene, a scene against the world the library and notes lay down, or a scene against the engine's state at that point (the variable says a character is alive; the scene buries her). A change over time is not a contradiction: a wound that heals, a mind that changes, a door that was shut and is now open are continuity working. A page in the library is a reference, not a scene: a scene may reveal that a page's claim is what people believe rather than what is true, and only a flat clash with no such reading is a contradiction. What a scene does not mention is a gap, not a contradiction; say nothing about it.

Report few, and only what you are sure of. Each contradiction is one sentence a writer would nod at, naming both ends, with the evidence: the scene key and the quoted sentence for each end, exactly as given (when one end is a page or a note, quote it and give the scene end as the scene). Scene keys are the ids in parentheses. Answer with the JSON the schema asks for and nothing else.`

/** How much of any one page, note, or unread prose travels; the roster stays bounded by the lane. */
const PAGE_BUDGET = 1600
const NOTE_LIMIT = 8

/** The lane in order with the state the engine holds on entering each scene, regardless of gates. */
export function walkStoryline(story: Story, storylineId: Slug): { scene: Slug; state: VariableState; gated?: string }[] {
  const storyline = story.manifest.storylines.find((s) => s.id === storylineId)
  if (!storyline) return []
  const ids = storyline.scenes.filter((id) => story.scenes.has(id))
  if (ids.length === 0) return []
  const steps: { scene: Slug; state: VariableState; gated?: string }[] = []
  let sim = startSimulation(story, ids[0])
  steps.push({ scene: ids[0], state: sim.state })
  for (let i = 1; i < ids.length; i++) {
    sim = take(story, sim, { kind: 'continue', label: '', to: ids[i], available: true, storyline: storylineId })
    const condition = story.scenes.get(ids[i])?.condition
    const step: { scene: Slug; state: VariableState; gated?: string } = { scene: ids[i], state: sim.state }
    if (condition !== undefined) step.gated = condition
    steps.push(step)
  }
  return steps
}

/**
 * What the lane touches: every library page a scene in it names (by the
 * matcher, by the scene's own characters field, or by a read), and the
 * notes that name any of those or any of the lane's scenes, most-named
 * first. This is the relevance the model is not asked to guess at.
 */
export function laneContext(story: Story, storylineId: Slug, ledger: Ledger, dict: Dictionary = dictionary(story)) {
  const storyline = story.manifest.storylines.find((s) => s.id === storylineId)
  const sceneIds = storyline ? storyline.scenes.filter((id) => story.scenes.has(id)) : []
  const cast = new Set<TargetKey>()
  for (const id of sceneIds) {
    const scene = story.scenes.get(id)
    if (!scene) continue
    const key = `scene:${id}`
    for (const character of scene.characters) if (story.references.has(character)) cast.add(targetKey(story.references.get(character)!))
    for (const span of findMentions(itemText(story, key) ?? '', dict, { self: key, verdicts: story.verdicts[key] })) {
      if (span.certainty === 'probable') continue
      for (const t of span.targets) if (t.kind === 'character' || t.kind === 'place' || t.kind === 'lore') cast.add(targetKey(t))
    }
    const entry = ledger[key]
    if (entry) {
      for (const m of entry.mentions) if (dict.targets.get(m.entity)?.kind !== 'note') cast.add(m.entity)
      for (const d of entry.developments) if (dict.targets.get(d.entity)?.kind !== 'note') cast.add(d.entity)
    }
  }
  const pages = [...cast]
    .map((key) => story.references.get(key.split(':')[1]))
    .filter((e): e is NonNullable<typeof e> => !!e && cast.has(targetKey(e)))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))

  const wanted = new Set<TargetKey>([...cast, ...sceneIds.map((id) => `scene:${id}`)])
  const notes = [...story.notes.values()]
    .map((note) => {
      const key = `note:${note.id}`
      let hits = 0
      for (const span of findMentions(note.body, dict, { self: key, verdicts: story.verdicts[key] })) {
        if (span.certainty === 'probable') continue
        if (span.targets.some((t) => wanted.has(targetKey(t)))) hits++
      }
      return { note, hits }
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.note.title.localeCompare(b.note.title))
    .slice(0, NOTE_LIMIT)
    .map((row) => row.note)
  return { pages, notes }
}

function clip(text: string, budget: number = PAGE_BUDGET): string {
  const trimmed = text.trim()
  if (trimmed.length <= budget) return trimmed
  const cut = trimmed.slice(0, budget)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'))
  return `${end > budget / 2 ? cut.slice(0, end + 1) : cut}\n[… cut here; the page goes on]`
}

export function briefContinuity(story: Story, storylineId: Slug, ledger: Ledger, dict: Dictionary = dictionary(story)): string | undefined {
  const storyline = story.manifest.storylines.find((s) => s.id === storylineId)
  if (!storyline) return undefined
  const lines: string[] = []
  const { pages, notes } = laneContext(story, storylineId, ledger, dict)

  lines.push('# The world this storyline touches', '')
  if (pages.length === 0) lines.push('(no library page is named in it)', '')
  for (const page of pages) {
    const also = page.aliases.length ? ` — also called ${page.aliases.map((a) => `"${a}"`).join(', ')}` : ''
    lines.push(`## ${page.kind}: ${page.title} (${targetKey(page)})${also}`, '', clip(page.body) || '(the page is empty)', '')
  }
  if (notes.length) {
    lines.push('# Notes that bear on it', '')
    for (const note of notes) lines.push(`## note: ${note.title} (note:${note.id})`, '', clip(note.body) || '(the note is empty)', '')
  }

  lines.push(`# Storyline "${storyline.name}" (${storyline.id}), in order`, '')
  const steps = walkStoryline(story, storylineId)
  if (steps.length === 0) lines.push('(no scenes)')
  for (const [i, step] of steps.entries()) {
    const scene = story.scenes.get(step.scene)
    if (!scene) continue
    lines.push(`## ${i + 1}. ${scene.title} (${scene.id})`)
    const state = Object.entries(step.state).map(([id, value]) => `${id} = ${String(value)}`)
    lines.push(`State on entering: ${state.length ? state.join(', ') : '(no variables)'}`)
    if (step.gated) lines.push(`Gated by: ${step.gated}`)
    if (scene.characters.length) lines.push(`Characters listed: ${scene.characters.join(', ')}`)
    if (scene.synopsis) lines.push(`Synopsis: ${scene.synopsis}`)
    if (scene.beats.length) lines.push(`Beats: ${scene.beats.map((b, n) => `${n + 1}. ${b}`).join(' ')}`)
    const entry = ledger[`scene:${scene.id}`]
    if (entry) {
      if (entry.developments.length === 0) lines.push('Read; nothing developed.')
      else for (const d of entry.developments) lines.push(`- ${d.entity}: ${d.fact} — "${d.quote}"`)
    } else if (scene.prose.trim()) {
      lines.push('Not read yet; the prose:', '', clip(scene.prose))
    } else {
      lines.push('Not read yet, and no prose.')
    }
    lines.push('')
  }
  if (story.registry.variables.length) {
    lines.push('# The variables', '')
    for (const v of story.registry.variables) {
      lines.push(`${v.id} (${v.type}, starts at ${String(v.initial)})${v.description ? `: ${v.description}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

export function continuityRequest(
  story: Story,
  storylineId: Slug,
  ledger: Ledger,
  rubric: string = CONTINUITY_RUBRIC,
  dict: Dictionary = dictionary(story),
): WorkflowRequest | undefined {
  const briefing = briefContinuity(story, storylineId, ledger, dict)
  if (briefing === undefined) return undefined
  return { workflow: CHECK_CONTINUITY, system: `${rubric.trim()}\n\n${GLOSSARY}`, briefing, schema: CONTINUITY_SCHEMA }
}

/** Findings the app can show: evidence pointing at scenes the story has, nothing else. */
export function findingsFrom(output: ContinuityOutput, story: Story, storylineId: Slug, now: number = Date.now()): ContinuityFinding[] {
  const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  return (output.contradictions ?? [])
    .map((c, i) => ({
      id: `${storylineId}-${now}-${i}`,
      storyline: storylineId,
      message: clean(c.message),
      evidence: (c.evidence ?? [])
        .map((e) => ({ scene: clean(e.scene).replace(/^scene:/, ''), quote: clean(e.quote) }))
        .filter((e) => story.scenes.has(e.scene)),
    }))
    .filter((c) => c.message)
}
