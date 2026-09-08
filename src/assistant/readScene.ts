import type { Story, TargetKey } from '../domain/types'
import { variableUsage } from '../engine/usage'
import { GLOSSARY } from './glossary'
import { hashText, type EditorNote, type Ledger, type LedgerEntry } from './ledger'
import { findMentions, itemText, type Dictionary } from '../mentions/match'
import { parseTargetKey, targetKey } from '../mentions/verdicts'
import type { JsonSchema, WorkflowRequest } from './claudeCode'

/**
 * The read: one call per item that does what an editor with the whole
 * story in their head would do for this page. Underneath, the
 * bookkeeping the matcher cannot — phrases resolved, names refused,
 * what the item asserts about each named thing. On top, the editor's
 * notes: the scene against the world the library and notebook lay down
 * and against the scenes before it, the threads it leaves loose, the
 * state it implies that the engine does not track, the people and
 * places in the prose that the scene or the library does not know.
 */

export const READ_SCENE = 'read-scene'

export const NOTE_KINDS = ['continuity', 'loose-end', 'define', 'other'] as const
export const DEFINE_KINDS = ['character', 'place', 'lore', 'scene', 'note', 'variable'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export interface ReadSceneOutput {
  mentions: { quote: string; entity: string }[]
  rejected: { quote: string; candidate: string; why: string }[]
  developments: { entity: string; fact: string; quote: string }[]
  notes: {
    kind: string
    message: string
    quote: string
    entity?: string
    name?: string
    defineAs?: string
    variable?: { id: string; type: string; initial: string; description: string }
    effect?: string
  }[]
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
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...NOTE_KINDS] },
          message: { type: 'string' },
          quote: { type: 'string' },
          entity: { type: 'string' },
          name: { type: 'string' },
          defineAs: { type: 'string', enum: [...DEFINE_KINDS] },
          variable: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['boolean', 'number', 'enum'] },
              initial: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['id', 'type', 'initial', 'description'],
            additionalProperties: false,
          },
          effect: { type: 'string' },
        },
        required: ['kind', 'message', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['mentions', 'rejected', 'developments', 'notes'],
  additionalProperties: false,
}

export const READ_SCENE_RUBRIC = `You are the editor who has read the whole story and is now reading one page of it for a writing tool. You never write prose, never rewrite, never invent. You report, and every report quotes the page.

First, the bookkeeping. Mentions: phrases on this page that refer to a named thing on the roster but were not already matched by name — a role ("the smith"), a relation ("her sister"), an epithet, a nickname. Resolve only what the text supports; a pronoun with two possible referents is left alone; never list a pronoun on its own; never repeat a phrase the briefing says is already matched. Rejected: a candidate the briefing lists that does not refer to that thing here — a common word that happens to be a title, a name used about the writing rather than in the story, a misspelling that is a different word. Developments: facts this page asserts or changes about a named thing in the story world — where someone is, what they know, what they have, what has happened to them, what a place now is — one plain present-tense sentence each with the writer's sentence quoted verbatim. Few and sure.

Then the notes, which are the point. Each is one sentence a writer would nod at, with the quote from this page it rests on, and a kind:
- continuity: this page against the world the library pages and notes lay down, or against what the scenes before it developed. A change over time is not a contradiction; a flat clash is. A page in the library is a reference a scene may reveal to be belief rather than fact; say so only when the clash has no such reading.
- loose-end: a thing this page sets up, promises, or raises that nothing before it accounts for and that the writer may want to pay off — a named object, a threat, a question a character asks and nobody answers. Not every unanswered line is a loose end; only what a reader would carry forward.
- define: anything this page treats as part of the story that the story does not yet hold as a first-class thing, and this is the note that matters most. A person, a place, a region, a faction, a relic, a rite, a piece of history or world-building that a reader would expect to look up and the library has no page for: name it as written in name, and say in defineAs whether it should be a character, a place, or lore. An event this page tells or assumes that ought to be a scene of its own: defineAs scene, and name the scene. A body of world-building or backstory that deserves a note of its own: defineAs note, and name it. State this page implies that the story will want to test later and no variable tracks, an effect it plainly performs that the engine does not apply, a condition it plainly assumes: defineAs variable, and propose it (id in snake_case, type, initial, a one-line description in the writer's words) or give the effect as an expression the engine reads, e.g. "trust += 1", "mara_alive = false". Also a define note: a library character who is on this page but not in the scene's characters field (give their key as the entity, defineAs character). Judge by what the story would need, never by capital letters: "the swamp" and "port town" are places if the story keeps returning to them.
- other: anything an editor would flag that fits none of the above.

Restraint is the rule: a handful of notes at most, each one you would stand behind, none you cannot quote. A page that is fine gets no notes. Name every thing by its key from the roster, exactly as given (kind:id). Answer with the JSON the schema asks for and nothing else.`

const PAGE_BUDGET = 1400
const NOTE_LIMIT = 6

function clip(text: string, budget: number = PAGE_BUDGET): string {
  const trimmed = text.trim()
  if (trimmed.length <= budget) return trimmed
  const cut = trimmed.slice(0, budget)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'))
  return `${end > budget / 2 ? cut.slice(0, end + 1) : cut}\n[… cut here; the page goes on]`
}

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
    lines.push(`Characters the writer listed on this scene: ${scene.characters.length ? scene.characters.join(', ') : '(none listed)'}`, '')
    const engine: string[] = []
    if (scene.condition) engine.push(`gated by: ${scene.condition}`)
    for (const e of scene.effects) engine.push(`effect: ${e.source}`)
    for (const c of scene.choices) {
      engine.push(`choice "${c.label}" → scene:${c.to}${c.condition ? ` (gated by ${c.condition})` : ''}${c.effects.length ? ` [${c.effects.map((e) => e.source).join('; ')}]` : ''}`)
    }
    lines.push(`The scene's engine: ${engine.length ? engine.join('; ') : '(nothing: no gate, no effects, no choices)'}`, '')
  } else {
    lines.push('## Text', '', text || '(none)', '')
  }

  // The world this page touches: pages by the characters field, the matcher, and a past read; notes that name any of them.
  const spans = findMentions(text, dict, { self: item, verdicts: story.verdicts[item] })
  const certain = spans.filter((s) => s.certainty !== 'probable')
  const probable = spans.filter((s) => s.certainty === 'probable')
  const cast = new Set<TargetKey>()
  if (scene) for (const c of scene.characters) if (story.references.has(c)) cast.add(targetKey(story.references.get(c)!))
  for (const span of certain) for (const t of span.targets) if (t.kind === 'character' || t.kind === 'place' || t.kind === 'lore') cast.add(targetKey(t))
  const past = ledger[item]
  if (past) {
    for (const m of past.mentions) if (dict.targets.get(m.entity) && dict.targets.get(m.entity)!.kind !== 'note' && dict.targets.get(m.entity)!.kind !== 'scene') cast.add(m.entity)
  }
  const pages = [...cast]
    .map((key) => story.references.get(key.split(':')[1]))
    .filter((e): e is NonNullable<typeof e> => !!e && cast.has(targetKey(e)) && targetKey(e) !== item)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
  lines.push('# The world this page touches (the library, as the writer keeps it)', '')
  if (pages.length === 0) lines.push('(no library page is named on it)', '')
  for (const page of pages) {
    const also = page.aliases.length ? ` — also called ${page.aliases.map((a) => `"${a}"`).join(', ')}` : ''
    lines.push(`## ${page.kind}: ${page.title} (${targetKey(page)})${also}`, '', clip(page.body) || '(the page is empty)', '')
  }
  const wanted = new Set<TargetKey>([...cast, item])
  const notes = [...story.notes.values()]
    .filter((n) => `note:${n.id}` !== item)
    .map((n) => {
      const key = `note:${n.id}`
      let hits = 0
      for (const span of findMentions(n.body, dict, { self: key, verdicts: story.verdicts[key] })) {
        if (span.certainty === 'probable') continue
        if (span.targets.some((t) => wanted.has(targetKey(t)))) hits++
      }
      return { n, hits }
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.n.title.localeCompare(b.n.title))
    .slice(0, NOTE_LIMIT)
    .map((row) => row.n)
  if (notes.length) {
    lines.push('# Notes that bear on it (the notebook)', '')
    for (const n of notes) lines.push(`## note: ${n.title} (note:${n.id})`, '', clip(n.body) || '(the note is empty)', '')
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
  const otherNotes = [...story.notes.values()].filter((n) => `note:${n.id}` !== item)
  if (otherNotes.length) lines.push(`notes: ${otherNotes.map((n) => `${n.title} (note:${n.id})`).join('; ')}`)
  const scenes = [...story.scenes.values()].filter((s) => `scene:${s.id}` !== item)
  if (scenes.length) lines.push(`scenes: ${scenes.map((s) => `${s.title} (scene:${s.id})`).join('; ')}`)
  lines.push('')

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
      const summary = facts.length ? `, which developed: ${facts.join('; ')}` : previous.synopsis ? `, whose synopsis is: ${previous.synopsis}` : ' (nothing recorded about it)'
      before.push(`Along ${storyline.name}, the scene before is "${previous.title}" (scene:${previous.id})${summary}.`)
    }
    if (before.length) lines.push('# What came before', '', ...before, '')

    lines.push('# The variables (the registry, all of it)', '')
    if (story.registry.variables.length === 0) lines.push('(none declared yet)')
    const usage = variableUsage(story)
    for (const v of story.registry.variables) {
      const use = usage.get(v.id)
      const here = [...(use?.writes ?? []), ...(use?.reads ?? [])].filter((s) => s.scene === scene.id).map((s) => `${s.via}: ${s.source}`)
      const initial = 'initial' in v ? String(v.initial) : ''
      lines.push(`${v.id} (${v.type}, starts at ${initial}${v.description ? `, "${v.description}"` : ''})${here.length ? ` — on this scene: ${here.join('; ')}` : ''}`)
    }
    lines.push('')
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
 * dropped, empty strings are dropped, a note of no known kind is
 * dropped, and the entry carries the hash of the text it was read from.
 */
export function ledgerEntryFrom(output: ReadSceneOutput, text: string, dict: Dictionary, now: number = Date.now()): LedgerEntry {
  const known = (key: string) => dict.targets.has(key)
  const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  const notes: EditorNote[] = []
  for (const raw of output.notes ?? []) {
    const kind = clean(raw.kind) as NoteKind
    const message = clean(raw.message)
    if (!NOTE_KINDS.includes(kind) || !message) continue
    const note: EditorNote = { kind, message, quote: clean(raw.quote) }
    if (raw.entity && known(clean(raw.entity))) note.entity = clean(raw.entity)
    if (clean(raw.name)) note.name = clean(raw.name)
    if ((DEFINE_KINDS as readonly string[]).includes(clean(raw.defineAs))) note.defineAs = clean(raw.defineAs) as EditorNote['defineAs']
    if (note.kind === 'define' && !note.entity && !note.name) continue
    if (raw.variable && clean(raw.variable.id) && ['boolean', 'number', 'enum'].includes(clean(raw.variable.type))) {
      note.variable = {
        id: clean(raw.variable.id).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
        type: clean(raw.variable.type) as 'boolean' | 'number' | 'enum',
        initial: clean(raw.variable.initial),
        description: clean(raw.variable.description),
      }
    }
    if (clean(raw.effect)) note.effect = clean(raw.effect)
    notes.push(note)
  }
  return {
    hash: hashText(text),
    readAt: now,
    // A resolved phrase is a phrase on this page, not a sentence and not a
    // line from some other page the model had in front of it.
    mentions: (output.mentions ?? [])
      .map((m) => ({ quote: clean(m.quote), entity: clean(m.entity) }))
      .filter((m) => m.quote && known(m.entity) && m.quote.split(/\s+/).length <= 6 && text.toLowerCase().includes(m.quote.toLowerCase())),
    rejected: (output.rejected ?? [])
      .map((r) => ({ quote: clean(r.quote), candidate: clean(r.candidate), why: clean(r.why) }))
      .filter((r) => r.quote && known(r.candidate)),
    developments: (output.developments ?? [])
      .map((d) => ({ entity: clean(d.entity), fact: clean(d.fact), quote: clean(d.quote) }))
      .filter((d) => d.fact && known(d.entity)),
    notes,
  }
}
