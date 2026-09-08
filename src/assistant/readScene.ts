import type { Story, TargetKey } from '../domain/types'
import { variableUsage } from '../engine/usage'
import { GLOSSARY } from './glossary'
import { hashText, type Ledger, type LedgerEntry } from './ledger'
import { findMentions, itemText, type Dictionary } from '../mentions/match'
import { parseTargetKey, targetKey } from '../mentions/verdicts'
import type { JsonSchema, WorkflowRequest } from './claudeCode'

/**
 * The scene read: one small-tier call per changed item that does what the
 * matcher cannot — resolves a phrase that names no title, refuses a name
 * that means something else here, and records what the item asserts or
 * changes about each named thing. Its output feeds the editor's
 * decorations, the development log, and the continuity check.
 */

export const READ_SCENE = 'read-scene'

export interface ReadSceneOutput {
  mentions: { quote: string; entity: string }[]
  rejected: { quote: string; candidate: string; why: string }[]
  developments: { entity: string; fact: string; quote: string }[]
}

export const READ_SCENE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, entity: { type: 'string' } },
        required: ['quote', 'entity'],
        additionalProperties: false,
      },
    },
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, candidate: { type: 'string' }, why: { type: 'string' } },
        required: ['quote', 'candidate', 'why'],
        additionalProperties: false,
      },
    },
    developments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { entity: { type: 'string' }, fact: { type: 'string' }, quote: { type: 'string' } },
        required: ['entity', 'fact', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['mentions', 'rejected', 'developments'],
  additionalProperties: false,
}

export const READ_SCENE_RUBRIC = `You read one item from a writer's story for a writing tool and report three things about it. You never write prose, never suggest changes, and never invent.

Mentions: phrases in the text that refer to a named thing on the roster but were not already matched by name — a role ("the smith"), a relation ("her sister"), an epithet, a nickname. Resolve only what the text supports; a pronoun with two possible referents is left alone. Never list a pronoun on its own. Never repeat a phrase the briefing says is already matched.

Rejected: a candidate the briefing lists (an already-matched name or a near miss) that does not refer to that thing here — a common word that happens to be a title, a name used about the writing rather than in the story, a misspelling that is actually a different word. Say why in a phrase.

Developments: facts the item asserts or changes about a named thing in the story world — where someone is, what they know, what they have, what has happened to them, what a place now is. One plain sentence each, in the present tense, and the writer's own sentence quoted verbatim as evidence. Developments are about the story, never about the writing. Few and sure: a handful at most, and none you cannot quote.

Name every thing by its key from the roster, exactly as given (kind:id). Answer with the JSON the schema asks for and nothing else.`

/** The whole briefing for one item; pure, so tests can read it. */
export function briefReadScene(story: Story, item: TargetKey, dict: Dictionary, ledger: Ledger): string | undefined {
  const parsed = parseTargetKey(item)
  const text = itemText(story, item)
  if (!parsed || text === undefined) return undefined
  const lines: string[] = []
  const scene = parsed.kind === 'scene' ? story.scenes.get(parsed.id) : undefined
  const note = parsed.kind === 'note' ? story.notes.get(parsed.id) : undefined
  const title = scene?.title ?? note?.title ?? story.references.get(parsed.id)?.title ?? parsed.id
  lines.push(`# The item: ${parsed.kind} "${title}" (${item})`)
  lines.push('')
  if (scene) {
    lines.push('## Synopsis', '', scene.synopsis || '(none)', '')
    lines.push('## Beats', '', ...(scene.beats.length ? scene.beats.map((b, i) => `${i + 1}. ${b}`) : ['(none)']), '')
    lines.push('## Prose', '', scene.prose || '(none)', '')
    if (scene.characters.length) lines.push(`Characters the writer listed on this scene: ${scene.characters.join(', ')}`, '')
  } else {
    lines.push('## Text', '', text || '(none)', '')
  }

  lines.push('# The roster (name things by these keys)', '')
  const byKind = new Map<string, string[]>()
  for (const entity of story.references.values()) {
    const also = entity.aliases.length ? ` — also called ${entity.aliases.map((a) => `"${a}"`).join(', ')}` : ''
    const list = byKind.get(entity.kind) ?? []
    list.push(`${entity.title} (${targetKey(entity)})${also}`)
    byKind.set(entity.kind, list)
  }
  for (const [kind, list] of [...byKind.entries()].sort()) lines.push(`${kind}s: ${list.join('; ')}`)
  const notes = [...story.notes.values()].filter((n) => `note:${n.id}` !== item)
  if (notes.length) lines.push(`notes: ${notes.map((n) => `${n.title} (note:${n.id})`).join('; ')}`)
  const scenes = [...story.scenes.values()].filter((s) => `scene:${s.id}` !== item)
  if (scenes.length) lines.push(`scenes: ${scenes.map((s) => `${s.title} (scene:${s.id})`).join('; ')}`)
  lines.push('')

  const spans = findMentions(text, dict, { self: item, verdicts: story.verdicts[item] })
  const certain = spans.filter((s) => s.certainty !== 'probable')
  const probable = spans.filter((s) => s.certainty === 'probable')
  lines.push('# Already matched by name (do not repeat; reject one only if it means something else here)', '')
  lines.push(certain.length ? certain.map((s) => `"${s.quote}" → ${s.targets.map(targetKey).join(' or ')}`).join('\n') : '(nothing)')
  lines.push('')
  lines.push('# Near misses to rule on (a mention of the candidate, or a rejection)', '')
  lines.push(probable.length ? probable.map((s) => `"${s.quote}" → ${s.targets.map(targetKey).join(' or ')}?`).join('\n') : '(nothing)')
  lines.push('')

  if (scene) {
    const before: string[] = []
    for (const storyline of story.manifest.storylines) {
      const at = storyline.scenes.indexOf(scene.id)
      if (at <= 0) continue
      const previous = story.scenes.get(storyline.scenes[at - 1])
      if (!previous) continue
      const entry = ledger[`scene:${previous.id}`]
      const facts = entry?.developments.map((d) => `${d.entity}: ${d.fact}`) ?? []
      before.push(`Along ${storyline.name}, the scene before is "${previous.title}"${facts.length ? `, which developed: ${facts.join('; ')}` : ' (not read yet)'}.`)
    }
    if (before.length) lines.push('# What came before', '', ...before, '')

    const usage = variableUsage(story)
    const touched = story.registry.variables.filter((v) => {
      const use = usage.get(v.id)
      return use && [...use.reads, ...use.writes].some((site) => site.scene === scene.id)
    })
    if (touched.length) {
      lines.push('# Variables this scene touches', '')
      for (const v of touched) {
        const use = usage.get(v.id)
        const here = [...(use?.writes ?? []), ...(use?.reads ?? [])].filter((s) => s.scene === scene.id).map((s) => `${s.via}: ${s.source}`)
        lines.push(`${v.id} (${v.type}${v.description ? `, "${v.description}"` : ''}) — ${here.join('; ')}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}

/** The request, with the writer's prompt (or the default) and the story's glossary as the rubric. */
export function readSceneRequest(story: Story, item: TargetKey, dict: Dictionary, ledger: Ledger, rubric: string = READ_SCENE_RUBRIC): WorkflowRequest | undefined {
  const briefing = briefReadScene(story, item, dict, ledger)
  if (briefing === undefined) return undefined
  return { workflow: READ_SCENE, system: `${rubric.trim()}\n\n${GLOSSARY}`, briefing, schema: READ_SCENE_SCHEMA }
}

/**
 * The read as the ledger keeps it: keys the roster does not have are
 * dropped, empty strings are dropped, and the entry carries the hash of
 * the text it was read from.
 */
export function ledgerEntryFrom(output: ReadSceneOutput, text: string, dict: Dictionary, now: number = Date.now()): LedgerEntry {
  const known = (key: string) => dict.targets.has(key)
  const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  return {
    hash: hashText(text),
    readAt: now,
    mentions: (output.mentions ?? [])
      .map((m) => ({ quote: clean(m.quote), entity: clean(m.entity) }))
      .filter((m) => m.quote && known(m.entity)),
    rejected: (output.rejected ?? [])
      .map((r) => ({ quote: clean(r.quote), candidate: clean(r.candidate), why: clean(r.why) }))
      .filter((r) => r.quote && known(r.candidate)),
    developments: (output.developments ?? [])
      .map((d) => ({ entity: clean(d.entity), fact: clean(d.fact), quote: clean(d.quote) }))
      .filter((d) => d.fact && known(d.entity)),
  }
}
