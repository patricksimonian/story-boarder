import type { Slug, Story, VariableState } from '../domain/types'
import { startSimulation, take } from '../engine/simulate'
import type { JsonSchema, WorkflowRequest } from './claudeCode'
import { GLOSSARY } from './glossary'
import type { Ledger } from './ledger'

/**
 * The continuity check: the synthesis stage over one storyline. Its
 * input is the ledger, never the prose — the developments each scene
 * recorded, in lane order, with the variable state the engine holds at
 * each — and its output is contradictions a writer would nod at, each
 * end quoted. One large-tier call per storyline.
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

You are given the storyline's scenes in order. For each: the developments a reading of that scene recorded (facts about the story world, each with the writer's sentence as evidence) and the variable state the story engine holds on entering it. A contradiction is two developments that cannot both hold on this path, or a development that contradicts the engine's state at that point (the variable says a character is alive; the scene buries her). A change over time is not a contradiction: a wound that heals, a mind that changes, a door that was shut and is now open are continuity working. A scene not yet read is a gap, not a contradiction; say nothing about it.

Report few, and only what you are sure of. Each contradiction is one sentence a writer would nod at, naming both ends, with the evidence: the scene key and the quoted sentence for each end, exactly as given. Scene keys are the ids in parentheses. Answer with the JSON the schema asks for and nothing else.`

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

export function briefContinuity(story: Story, storylineId: Slug, ledger: Ledger): string | undefined {
  const storyline = story.manifest.storylines.find((s) => s.id === storylineId)
  if (!storyline) return undefined
  const lines: string[] = [`# Storyline "${storyline.name}" (${storyline.id}), in order`, '']
  const steps = walkStoryline(story, storylineId)
  if (steps.length === 0) lines.push('(no scenes)')
  for (const [i, step] of steps.entries()) {
    const scene = story.scenes.get(step.scene)
    if (!scene) continue
    lines.push(`## ${i + 1}. ${scene.title} (${scene.id})`)
    const state = Object.entries(step.state).map(([id, value]) => `${id} = ${String(value)}`)
    lines.push(`State on entering: ${state.length ? state.join(', ') : '(no variables)'}`)
    if (step.gated) lines.push(`Gated by: ${step.gated}`)
    const entry = ledger[`scene:${scene.id}`]
    if (!entry) lines.push('Not read yet.')
    else if (entry.developments.length === 0) lines.push('Read; nothing developed.')
    else for (const d of entry.developments) lines.push(`- ${d.entity}: ${d.fact} — "${d.quote}"`)
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

export function continuityRequest(story: Story, storylineId: Slug, ledger: Ledger, rubric: string = CONTINUITY_RUBRIC): WorkflowRequest | undefined {
  const briefing = briefContinuity(story, storylineId, ledger)
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
