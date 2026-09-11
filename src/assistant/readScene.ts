import type { Story, TargetKey } from '../domain/types'
import { variableUsage } from '../engine/usage'
import { GLOSSARY } from './glossary'
import { hashText, type EditorNote, type Ledger, type LedgerEntry } from './ledger'
import { findMentions, itemText, mentionIndex, type Dictionary } from '../mentions/match'
import { parseTargetKey, phraseKey, targetKey } from '../mentions/verdicts'
import type { JsonSchema, WorkflowRequest } from './claudeCode'

/**
 * The read: one call per item that does what an editor with the whole
 * story in their head would do for this page. Its answer has a field
 * for each job, named plainly so a small model reaches for each one:
 * synonyms (a phrase that names something the story has, under other
 * words), untracked entities (what the page treats as part of the story
 * that nothing describes yet), untracked variables (state the page
 * changes or assumes that the registry does not track), developments
 * (what the page says about each named thing), and the editor's notes
 * (continuity, loose ends). Underneath, the ledger keeps the same shape
 * it always did.
 */

export const READ_SCENE = 'read-scene'

export const NOTE_KINDS = ['continuity', 'loose-end', 'define', 'other'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]
export const DEFINE_KINDS = ['character', 'place', 'lore', 'scene', 'note', 'variable'] as const
/** The kinds an untracked entity can be: a page, a scene, or a note. A variable is its own job. */
const PAGE_KINDS = ['character', 'place', 'lore', 'scene', 'note']

export interface ReadSceneOutput {
  /** A phrase on this page that names something the story has, under other words. */
  synonyms: { phrase: string; entity: string }[]
  /** What this page treats as part of the story that no page, scene, or note describes. */
  untracked_entities: {
    name: string
    kind: string
    message: string
    quote: string
    suggestion?: string
    /** An older prompt may still file a variable here; the ledger takes it either way. */
    variable?: { id: string; type: string; initial: string; description: string }
    effect?: string
  }[]
  /** State this page changes or assumes that a later scene would test, and no variable tracks. */
  untracked_variables?: {
    name: string
    message: string
    quote: string
    variable: { id: string; type: string; initial: string; description: string }
    effect?: string
    condition?: string
    suggestion?: string
  }[]
  /** Library characters in a scene's prose that its characters field does not list, by key. */
  unlisted_characters?: string[]
  developments: { entity: string; fact: string; quote: string }[]
  rejected: { quote: string; candidate: string; why: string }[]
  notes: {
    kind: string
    message: string
    quote: string
    suggestion?: string
    against?: { where: string; quote: string }
  }[]
}

const VARIABLE_SHAPE = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'snake_case' },
    type: { type: 'string', enum: ['boolean', 'number', 'enum'] },
    initial: { type: 'string' },
    description: { type: 'string', description: "one line, in the writer's words" },
  },
  required: ['id', 'type', 'initial', 'description'],
  additionalProperties: false,
}

export const READ_SCENE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    synonyms: {
      type: 'array',
      description:
        'Phrases on this page that name something the story already has, under other words: a role, a relation, an epithet, a nickname, a title the library gives another way. "the salt queen" names character:queen-ilsabet when her page calls her the salt queen.',
      items: {
        type: 'object',
        properties: {
          phrase: { type: 'string', description: 'the phrase as it appears on this page, a few words at most' },
          entity: { type: 'string', description: 'the key of the thing it names, kind:id, from the list of what the story has' },
        },
        required: ['phrase', 'entity'],
        additionalProperties: false,
      },
    },
    untracked_entities: {
      type: 'array',
      description:
        'What this page treats as part of the story that no page, scene, or note describes yet: a person, place, region, faction, relic, rite, piece of history (character, place, lore); an event that should be a scene; world-building that should be a note.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'as written on this page' },
          kind: { type: 'string', enum: PAGE_KINDS },
          message: { type: 'string', description: 'one sentence: "X is mentioned, but no [kind] describes it"' },
          quote: { type: 'string', description: 'the sentence on this page it rests on, verbatim' },
          suggestion: { type: 'string', description: 'what the writer could do, one sentence starting with a verb' },
        },
        required: ['name', 'kind', 'message', 'quote'],
        additionalProperties: false,
      },
    },
    untracked_variables: {
      type: 'array',
      description:
        'State this page changes or assumes that a later scene would test, and no variable in the registry tracks: who has a thing, where someone is, what someone knows, whether a way is open or closed. Each with the variable proposed.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "the state, in the writer's words: \"whether the girl has the tide bell\"" },
          message: { type: 'string', description: 'one sentence: what this page changes or assumes, and that no variable tracks it' },
          quote: { type: 'string', description: 'the sentence on this page it rests on, verbatim' },
          variable: VARIABLE_SHAPE,
          effect: { type: 'string', description: 'an effect this page performs, as the engine reads it, e.g. "girl_has_bell = true"' },
          condition: { type: 'string', description: 'a condition this page plainly assumes, as the engine reads it, e.g. "crossing_open == false"' },
          suggestion: { type: 'string', description: 'what the writer could do, one sentence starting with a verb' },
        },
        required: ['name', 'message', 'quote', 'variable'],
        additionalProperties: false,
      },
    },
    unlisted_characters: {
      type: 'array',
      description: "On a scene only: keys of library characters who are in the scene's prose but not in its characters field.",
      items: { type: 'string' },
    },
    developments: {
      type: 'array',
      description: 'Facts this page asserts or changes about a named thing in the story world, one plain present-tense sentence each, with the writer\'s sentence quoted verbatim.',
      items: {
        type: 'object',
        properties: { entity: { type: 'string' }, fact: { type: 'string' }, quote: { type: 'string' } },
        required: ['entity', 'fact', 'quote'],
        additionalProperties: false,
      },
    },
    rejected: {
      type: 'array',
      description: 'A name the briefing lists as already matched that does not mean that thing here.',
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, candidate: { type: 'string' }, why: { type: 'string' } },
        required: ['quote', 'candidate', 'why'],
        additionalProperties: false,
      },
    },
    notes: {
      type: 'array',
      description: "The editor's notes: continuity (with both ends), loose ends, anything else worth flagging.",
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['continuity', 'loose-end', 'other'] },
          message: { type: 'string', description: 'one full sentence stating what is the case on this page' },
          quote: { type: 'string', description: 'the sentence on this page it rests on, verbatim' },
          suggestion: { type: 'string', description: 'what the writer could do, one sentence starting with a verb' },
          against: {
            type: 'object',
            description: 'for continuity: the other end — the page or scene this clashes with, by key, and its sentence',
            properties: { where: { type: 'string' }, quote: { type: 'string' } },
            required: ['where', 'quote'],
            additionalProperties: false,
          },
        },
        required: ['kind', 'message', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['synonyms', 'untracked_entities', 'untracked_variables', 'developments', 'rejected', 'notes'],
  additionalProperties: false,
}

export const READ_SCENE_RUBRIC = `You are the editor who has read the whole story and is now reading one page of it for a writing tool. You never write prose, never rewrite, never invent. You report, and every report quotes the page. The answer has a field for each job; do every job, in this order.

synonyms: every phrase on this page that names something the story already has, under other words than its title — a role ("the smith"), a relation ("her sister"), an epithet, a nickname, a title the library gives another way. The list of what the story has gives each library page with the first line of its page: when a phrase on this page matches how a page describes its own subject, that phrase names that page ("the salt queen" names character:queen-ilsabet when her page opens "The salt queen of Marrow Point"). Go through the list; for each thing, ask whether this page refers to it by other words, and if it does, list the phrase with that thing's key. A likely reading is enough; the writer confirms it on the page. Never list a pronoun on its own, never a whole sentence, never a phrase the briefing says is already matched.

untracked_entities: anything this page treats as part of the story that no page, scene, or note describes yet. Check the list of what the story has first: a thing that has a page is never untracked, whatever the page is called. A person, a place, a region, a faction, a relic, a rite, a piece of history or world-building that a reader would expect to look up: name it as written, with kind character, place, or lore. An event this page tells or assumes that ought to be a scene of its own: kind scene. A body of world-building or backstory that deserves a note of its own: kind note. Judge by what the story would need, never by capital letters: "the swamp" and "port town" are places if the story keeps returning to them. The message states what is the case: "The Rite of Brine is mentioned, but no lore page describes it." Never write that a thing wants, needs, deserves, or should have a page; a story has no wishes. When the briefing shows the scenes and notes that name this page, read them for this page's subject too. When it lists things other reads already said the story lacks, connect them rather than flagging them fresh.

untracked_variables: state this page changes or assumes that a later scene would test, and no variable in the registry tracks. Who has a thing now, where someone is, what someone knows, whether a way is open or closed, whether someone lives, whether a thing has happened. An object the page hands over is an entity; that someone now holds it is state, and state is this job. Go through the registry in the briefing and ask what this page changes or relies on that is not on it; the plainest case is a scene whose engine has no effects while its prose changes something a later scene would test. A choice this page puts to the reader is state as well: what they answered is what a later scene would test, whether or not this page goes on to use it — a page that asks "can you keep a secret?" and offers yes and no proposes the variable for the answer, girl_keeps_secret, even when both answers lead to the same line. A fact that holds from the story's start and that this page only states — who someone is, what they have always lacked or never known — is a development, and the page about them is where it lives; propose a variable only where this page is the one that changes the fact, or the one that would have to test it. For each, propose the variable (id in snake_case, type boolean, number, or enum, its initial value, a one-line description in the writer's words) and the effect this page performs as an expression the engine reads ("girl_has_bell = true"), or the condition it assumes. The message states what is the case: "This scene gives the girl the tide bell, and no variable tracks who holds it." Never propose a variable the registry already has, and never one for a thing this page merely names.

unlisted_characters: on a scene only, the keys of library characters who are in the scene's prose but not in its characters field. Never on a note or a library page.

developments: facts this page asserts or changes about a named thing in the story world — where someone is, what they know, what they have, what has happened to them, what a place now is — one plain present-tense sentence each, with the writer's sentence quoted verbatim. Few and sure.

rejected: a name the briefing lists as already matched that does not mean that thing here — a common word that happens to be a title, a name used about the writing rather than in the story, a misspelling that is a different word.

notes: the editor's notes. Every note is one full sentence stating what is the case on this page — never a title, a topic, or a phrase like "the Keepers' burden" — with the sentence on this page it rests on quoted verbatim, and a suggestion saying what the writer could do about it, starting with a verb: "Decide whether…", "Add a line where…", "Check the Keepers page against…". A continuity note sets this page against the world the library pages and notes lay down, or against what the scenes before it developed; it names both ends, and against carries the other end — the key of that page or scene as the briefing gives it, and its sentence, verbatim. A continuity note without against is dropped. A change over time is not a contradiction; a flat clash is. A page in the library is a reference a scene may reveal to be belief rather than fact; say so only when the clash has no such reading. A loose-end note is a thing this page sets up, promises, or raises that nothing before it accounts for and that a reader would carry forward; say what is set up and what is left open, and where or how it could be paid off. A choice this page offers whose answers all lead to the same place, with nothing recording the answer, is a loose end of this kind: say so, and whether a variable or a cut would settle it. Other: anything an editor would flag that fits neither.

Restraint is the rule for the notes: a handful at most, each one you would stand behind, none you cannot quote. A page that is fine gets no notes. Name every thing by its key from the list of what the story has, exactly as given (kind:id). Answer with the JSON the schema asks for and nothing else.`

const PAGE_BUDGET = 1400
const NOTE_LIMIT = 6
const NAMER_LIMIT = 6

/** A page's opening sentence beside its name, so "Queen Ilsabet: the salt queen of Marrow Point" reads as one thing. */
function firstSentence(body: string): string {
  const first = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+ +/, '').replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!first) return ''
  const end = first.search(/[.!?](\s|$)/)
  const sentence = end > 0 ? first.slice(0, end + 1) : first
  return sentence.length > 140 ? `${sentence.slice(0, 140).trimEnd()}…` : sentence
}

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

  // A page's subject reaches into the scenes and notes that name it: the
  // Owl Leader lives in the owls' scenes, not on the owls' page.
  if (!scene) {
    const namers = (mentionIndex(story, dict).get(item) ?? [])
      .filter((site) => targetKey(site.item) !== item)
      .sort((a, b) => b.count - a.count || a.item.title.localeCompare(b.item.title))
      .slice(0, NAMER_LIMIT)
    if (namers.length) {
      lines.push('# Where this page is named (read these for its subject too)', '')
      for (const site of namers) {
        const key = targetKey(site.item)
        lines.push(`## ${site.item.kind}: ${site.item.title} (${key})`, '', clip(itemText(story, key) ?? '') || '(empty)', '')
      }
    }
  }

  const missing: string[] = []
  for (const [other, entry] of Object.entries(ledger)) {
    if (other === item) continue
    for (const n of entry.notes ?? []) {
      if (n.kind === 'define' && !n.entity && n.name) {
        const where = dict.targets.get(other)?.title ?? other
        missing.push(`${n.name} (${n.defineAs ?? 'something'}, flagged on ${where})`)
      }
    }
  }
  if (missing.length) lines.push('# Things other reads said the story lacks', '', ...missing.slice(0, 20), '')

  lines.push('# What the story has (name things by these keys; each library page with the first line of its page)', '')
  const byKind = new Map<string, string[]>()
  for (const entity of story.references.values()) {
    const also = entity.aliases.length ? ` — also called ${entity.aliases.map((a) => `"${a}"`).join(', ')}` : ''
    const gist = firstSentence(entity.body)
    const list = byKind.get(entity.kind) ?? []
    list.push(`${entity.title} (${targetKey(entity)})${also}${gist ? `: ${gist}` : ''}`)
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
 * The read as the ledger keeps it: keys the story does not have are
 * dropped, empty strings are dropped, and the entry carries the hash of
 * the text it was read from. Synonyms become mentions; untracked
 * entities and unlisted characters become define notes; the notes keep
 * their kinds. The ledger's shape does not change with the answer's.
 */
export function ledgerEntryFrom(output: ReadSceneOutput, text: string, dict: Dictionary, now: number = Date.now(), item?: TargetKey): LedgerEntry {
  const isScene = item === undefined || item.startsWith('scene:')
  const drawn = findMentions(text, dict, item ? { self: item } : {})
  const known = (key: string) => dict.targets.has(key)
  const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  const notes: EditorNote[] = []

  const proposal = (raw: { id: string; type: string; initial: string; description: string } | undefined): EditorNote['variable'] | undefined => {
    if (!raw || !clean(raw.id) || !['boolean', 'number', 'enum'].includes(clean(raw.type))) return undefined
    const id = clean(raw.id).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
    if (!id) return undefined
    return { id, type: clean(raw.type) as 'boolean' | 'number' | 'enum', initial: clean(raw.initial), description: clean(raw.description) }
  }

  for (const raw of output.untracked_entities ?? []) {
    const name = clean(raw.name)
    const kind = clean(raw.kind)
    if (!name || !(DEFINE_KINDS as readonly string[]).includes(kind)) continue
    const defineAs = kind as EditorNote['defineAs']
    if (defineAs !== 'variable') {
      // A "missing" claim about a name the story already has is the read's
      // error, not a gap: the Keepers page is called The Keepers.
      const claimed = findMentions(name, dict).some((span) => span.certainty === 'certain' && span.targets.length > 0)
      if (claimed) continue
    } else if (dict.targets.has(`variable:${name}`)) continue
    const note: EditorNote = { kind: 'define', message: clean(raw.message) || `${name} is mentioned, but nothing in the story describes it.`, quote: clean(raw.quote), name, defineAs }
    if (clean(raw.suggestion)) note.suggestion = clean(raw.suggestion)
    const variable = proposal(raw.variable)
    if (variable) note.variable = variable
    if (clean(raw.effect)) note.effect = clean(raw.effect)
    notes.push(note)
  }

  // A variable proposal with no usable proposal, or for state the registry
  // already tracks, is nothing the writer can act on.
  for (const raw of output.untracked_variables ?? []) {
    const name = clean(raw.name)
    const variable = proposal(raw.variable)
    if (!name || !variable) continue
    if (dict.targets.has(`variable:${variable.id}`) || dict.targets.has(`variable:${name}`)) continue
    const note: EditorNote = {
      kind: 'define',
      message: clean(raw.message) || `${name} is state this page changes, and no variable tracks it.`,
      quote: clean(raw.quote),
      name,
      defineAs: 'variable',
      variable,
    }
    if (clean(raw.suggestion)) note.suggestion = clean(raw.suggestion)
    // The note carries the effect; a condition the page assumes is said in the message.
    if (clean(raw.effect)) note.effect = clean(raw.effect)
    notes.push(note)
  }

  // "In the prose but not listed on the scene" means nothing on a note or a library page.
  if (isScene) {
    for (const raw of output.unlisted_characters ?? []) {
      const key = clean(raw)
      const target = dict.targets.get(key)
      if (!target || target.kind !== 'character') continue
      notes.push({ kind: 'define', message: `${target.title} is in the prose but not listed on the scene.`, quote: '', entity: key, defineAs: 'character' })
    }
  }

  for (const raw of output.notes ?? []) {
    const kind = clean(raw.kind) as NoteKind
    const message = clean(raw.message)
    if (!['continuity', 'loose-end', 'other'].includes(kind) || !message) continue
    // A note is a full sentence about this page, not a topic; a continuity note names its other end.
    if (message.split(/\s+/).length < 5) continue
    const note: EditorNote = { kind, message, quote: clean(raw.quote) }
    if (clean(raw.suggestion)) note.suggestion = clean(raw.suggestion)
    if (raw.against && clean(raw.against.where) && clean(raw.against.quote)) {
      note.against = { where: clean(raw.against.where), quote: clean(raw.against.quote) }
    }
    if (kind === 'continuity' && !note.against) continue
    notes.push(note)
  }

  return {
    hash: hashText(text),
    readAt: now,
    // A synonym is a phrase on this page, not a sentence and not a line
    // from some other page the model had in front of it.
    mentions: (output.synonyms ?? [])
      .map((m) => ({ quote: clean(m.phrase), entity: clean(m.entity) }))
      .filter((m) => m.quote && known(m.entity) && m.quote.split(/\s+/).length <= 6 && text.toLowerCase().includes(m.quote.toLowerCase())),
    // A rejection only means something for a name the matcher actually
    // drew for that thing; the rest is the model ruling out air.
    rejected: (output.rejected ?? [])
      .map((r) => ({ quote: clean(r.quote), candidate: clean(r.candidate), why: clean(r.why) }))
      .filter((r) => r.quote && known(r.candidate) && drawn.some((span) => phraseKey(span.quote) === phraseKey(r.quote) && span.targets.some((t) => targetKey(t) === r.candidate))),
    developments: (output.developments ?? [])
      .map((d) => ({ entity: clean(d.entity), fact: clean(d.fact), quote: clean(d.quote) }))
      .filter((d) => d.fact && known(d.entity)),
    notes,
  }
}
