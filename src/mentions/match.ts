import type { ReferenceKind, Slug, Story } from '../domain/types'
import { parseTargetKey, phraseKey, targetKey, type TargetKey, type Verdict } from './verdicts'

/**
 * The matcher: where prose names something the story knows. It runs on
 * every keystroke inside the editor, so it is string work and nothing
 * else — a literal pass over titles, aliases, and ids, then a fuzzy pass
 * that catches a misspelt name. What it cannot decide (a phrase that
 * names no title, a word that means two things) is the scene read's job;
 * its verdicts arrive here as extra terms and suppressions and the
 * matcher draws them on the next keystroke like anything else.
 */

export type MentionKind = ReferenceKind | 'note' | 'scene' | 'variable'

export interface Target {
  kind: MentionKind
  id: Slug
  title: string
}

/**
 * How sure the span is: a title or alias as written, a near miss, a
 * phrase the model resolved — or `unknown`: a name the story has no page
 * for, drawn so the writer can make one or say it is nothing.
 */
export type Certainty = 'certain' | 'probable' | 'model' | 'unknown'

export interface Span {
  from: number
  to: number
  quote: string
  /** More than one only when the same phrase titles two things — the tooltip shows both. */
  targets: Target[]
  certainty: Certainty
}

interface Entry {
  words: string[]
  /** Between consecutive words, whitespace removed — `:` in "Cold Open: Lowmarket". */
  gaps: string[]
  /** A proper noun: each capitalised word (articles aside) must be matched with its capital. */
  proper: boolean
  target: Target
  certainty: Certainty
  /** Verdict terms outrank dictionary terms of the same length; a writer's outrank a model's. */
  rank: 0 | 1 | 2
}

export interface Dictionary {
  targets: Map<TargetKey, Target>
  entries: Entry[]
  /** Words too common to ever be a near miss. */
  stoplist: Set<string>
}

const ARTICLES = new Set(['the', 'a', 'an'])

const COMMON = [
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'over',
  'under', 'that', 'this', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'him',
  'was', 'were', 'is', 'are', 'be', 'been', 'had', 'has', 'have', 'did', 'does', 'do', 'not', 'no', 'yes', 'as',
  'so', 'if', 'then', 'than', 'when', 'where', 'what', 'who', 'how', 'why', 'which', 'there', 'here', 'out', 'up',
  'down', 'back', 'once', 'one', 'two', 'all', 'any', 'some', 'more', 'most', 'very', 'just', 'only', 'even',
  'still', 'again', 'never', 'ever', 'now', 'said', 'says', 'came', 'come', 'went', 'go', 'got', 'get', 'made',
  'make', 'like', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'about', 'after', 'before',
  'through', 'between', 'against', 'off', 'own', 'same', 'other', 'each', 'every', 'both', 'few', 'many', 'much',
  'too', 'also', 'well', 'way', 'time', 'day', 'night', 'man', 'men', 'woman', 'door', 'hand', 'eyes', 'face',
]

const WORD = /[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*/gu

interface Token {
  text: string
  start: number
  end: number
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(WORD)) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  return tokens
}

/** A word as compared: lower case, straight apostrophe, possessive dropped. */
function norm(word: string): string {
  return word.toLowerCase().replace(/[’‘]/g, "'").replace(/'s$|'$/, '')
}

const isUpper = (ch: string) => ch !== ch.toLowerCase() && ch === ch.toUpperCase()

function entryFor(term: string, target: Target, certainty: Certainty, rank: Entry['rank'], proper: boolean): Entry | undefined {
  const tokens = tokenize(term)
  if (tokens.length === 0) return undefined
  const gaps: string[] = []
  for (let i = 1; i < tokens.length; i++) gaps.push(term.slice(tokens[i - 1].end, tokens[i].start).replace(/\s+/g, ''))
  return { words: tokens.map((t) => t.text), gaps, proper, target, certainty, rank }
}

/**
 * The forms a title is also found in: without its article ("The Keepers"
 * is named as "Keepers"), and with its last word in the other number
 * ("the Keeper role" names The Keepers). Derived from the title, never
 * guessed. A bare form is made only when the title writes it as a name —
 * "The Keepers" gives "Keepers", but "The seed" gives nothing, because
 * "seed" in prose is a seed — and only for words of four or more letters,
 * so a short title does not turn every near word into itself.
 */
export function titleVariants(title: string): string[] {
  const out = new Set<string>()
  const trimmed = title.trim()
  const bare = trimmed.replace(/^(the|a|an)\s+/i, '')
  const bareIsName = bare !== trimmed && /^\p{Lu}/u.test(bare)
  for (const base of new Set([trimmed, ...(bare === trimmed || bareIsName ? [bare] : [])])) {
    if (!base) continue
    out.add(base)
    const words = base.split(/\s+/)
    const last = words[words.length - 1]
    if (last.length < 4) continue
    const numbered: string[] = []
    if (/ies$/i.test(last)) numbered.push(last.replace(/ies$/i, 'y'))
    else if (/(s|x|z|ch|sh)es$/i.test(last)) numbered.push(last.replace(/es$/i, ''))
    else if (/[^s]s$/i.test(last)) numbered.push(last.slice(0, -1))
    else if (/[^aeiou]y$/i.test(last)) numbered.push(last.replace(/y$/i, 'ies'))
    else if (/(s|x|z|ch|sh)$/i.test(last)) numbered.push(`${last}es`)
    else numbered.push(`${last}s`)
    for (const form of numbered) {
      if (form.length < 3) continue
      out.add([...words.slice(0, -1), form].join(' '))
    }
  }
  out.delete(trimmed)
  return [...out]
}

/** Every name the story knows, ready to be found in prose. */
export function dictionary(story: Story): Dictionary {
  const targets = new Map<TargetKey, Target>()
  const entries: Entry[] = []
  const add = (target: Target, terms: string[], proper: boolean) => {
    targets.set(targetKey(target), target)
    for (const term of terms) {
      const entry = entryFor(term, target, 'certain', 0, proper)
      if (entry) entries.push(entry)
    }
  }
  for (const entity of story.references.values()) {
    add({ kind: entity.kind, id: entity.id, title: entity.title }, [entity.title, ...titleVariants(entity.title), ...entity.aliases], true)
  }
  for (const note of story.notes.values()) add({ kind: 'note', id: note.id, title: note.title }, [note.title, ...titleVariants(note.title)], true)
  for (const scene of story.scenes.values()) add({ kind: 'scene', id: scene.id, title: scene.title }, [scene.title], true)
  for (const variable of story.registry.variables) {
    add({ kind: 'variable', id: variable.id, title: variable.id }, [variable.id], false)
  }
  return { targets, entries, stoplist: stoplistFor(story) }
}

/** The fixed function words plus the story's own hundred most frequent, so a name like "Will" stays quiet. */
function stoplistFor(story: Story): Set<string> {
  const counts = new Map<string, number>()
  const count = (text: string) => {
    for (const token of tokenize(text)) {
      const word = norm(token.text)
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  for (const scene of story.scenes.values()) count([scene.synopsis, ...scene.beats, scene.prose].join('\n'))
  for (const note of story.notes.values()) count(note.body)
  for (const entity of story.references.values()) count(entity.body)
  const frequent = [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word]) => word)
  return new Set([...COMMON, ...frequent])
}

export interface FindOptions {
  /** The item the text belongs to: never a mention of itself. */
  self?: TargetKey
  /** Decisions about phrases in this item, the writer's and the model's. */
  verdicts?: Verdict[]
  /** Things a read said the story should define and has not, as written on the page; drawn as unknown wherever they appear. */
  unknowns?: string[]
}

export function findMentions(text: string, dict: Dictionary, opts: FindOptions = {}): Span[] {
  const tokens = tokenize(text)
  if (tokens.length === 0) return []
  const entries = [...dict.entries]
  const suppressed = new Set<string>()
  for (const verdict of opts.verdicts ?? []) {
    if (verdict.entity === null) {
      suppressed.add(phraseKey(verdict.quote))
      continue
    }
    const target = dict.targets.get(verdict.entity) ?? targetFromKey(verdict.entity)
    if (!target) continue
    const entry = entryFor(verdict.quote, target, verdict.by === 'writer' ? 'certain' : 'model', verdict.by === 'writer' ? 2 : 1, false)
    if (entry) entries.push(entry)
  }
  const byFirst = new Map<string, Entry[]>()
  for (const entry of entries) {
    const first = norm(entry.words[0])
    const list = byFirst.get(first)
    if (list) list.push(entry)
    else byFirst.set(first, [entry])
  }

  const spans: Span[] = []
  const covered = new Array<boolean>(tokens.length).fill(false)
  for (let i = 0; i < tokens.length; i++) {
    const candidates = (byFirst.get(norm(tokens[i].text)) ?? []).filter((entry) => matchesAt(entry, tokens, i, text))
    if (candidates.length === 0) continue
    const longest = Math.max(...candidates.map((c) => c.words.length))
    let best = candidates.filter((c) => c.words.length === longest)
    const rank = Math.max(...best.map((c) => c.rank))
    best = best.filter((c) => c.rank === rank)
    const from = tokens[i].start
    const to = tokens[i + longest - 1].end
    const quote = text.slice(from, to)
    if (!suppressed.has(phraseKey(quote))) {
      const targets = dedupe(best.map((c) => c.target)).filter((t) => targetKey(t) !== opts.self)
      if (targets.length) spans.push({ from, to, quote, targets, certainty: best[0].certainty })
    }
    for (let k = 0; k < longest; k++) covered[i + k] = true
    i += longest - 1
  }

  // The fuzzy pass: a lone word one or two edits from a single-word name.
  for (let i = 0; i < tokens.length; i++) {
    if (covered[i]) continue
    const token = tokens[i]
    const word = norm(token.text)
    if (word.length < 4 || dict.stoplist.has(word) || suppressed.has(phraseKey(token.text))) continue
    let bestDistance = Infinity
    let near: Entry[] = []
    for (const entry of dict.entries) {
      if (entry.words.length !== 1 || entry.target.kind === 'variable') continue
      if (entry.proper && isUpper(entry.words[0][0]) && !isUpper(token.text[0])) continue
      const term = norm(entry.words[0])
      const allowed = term.length <= 5 ? 1 : 2
      if (Math.abs(term.length - word.length) > allowed) continue
      const distance = editDistance(word, term, allowed)
      if (distance === 0 || distance > allowed) continue
      if (distance < bestDistance) {
        bestDistance = distance
        near = [entry]
      } else if (distance === bestDistance) near.push(entry)
    }
    if (near.length === 0) continue
    const targets = dedupe(near.map((e) => e.target)).filter((t) => targetKey(t) !== opts.self)
    if (targets.length) spans.push({ from: token.start, to: token.end, quote: token.text, targets, certainty: 'probable' })
  }

  // The unknown pass: the things a read said the story should hold and
  // does not yet — a page, a scene, a note, a variable — wherever their
  // names appear. Drawn in orange until they exist or the writer says
  // they are nothing. Nothing here guesses; the read decides.
  const taken = (from: number, to: number) => spans.some((s) => s.from < to && s.to > from)
  for (const phrase of opts.unknowns ?? []) {
    const entry = entryFor(phrase, { kind: 'lore', id: '', title: phrase }, 'unknown', 0, false)
    if (!entry || suppressed.has(phraseKey(phrase))) continue
    for (let i = 0; i + entry.words.length <= tokens.length; i++) {
      if (norm(tokens[i].text) !== norm(entry.words[0]) || !matchesAt(entry, tokens, i, text)) continue
      const from = tokens[i].start
      const to = tokens[i + entry.words.length - 1].end
      if (!taken(from, to)) spans.push({ from, to, quote: text.slice(from, to), targets: [], certainty: 'unknown' })
    }
  }
  return spans.sort((a, b) => a.from - b.from)
}

function matchesAt(entry: Entry, tokens: Token[], at: number, text: string): boolean {
  if (at + entry.words.length > tokens.length) return false
  for (let k = 0; k < entry.words.length; k++) {
    const want = entry.words[k]
    const have = tokens[at + k].text
    if (norm(want) !== norm(have)) return false
    if (entry.proper && isUpper(want[0]) && !ARTICLES.has(want.toLowerCase()) && !isUpper(have[0])) return false
    if (k > 0) {
      const gap = text.slice(tokens[at + k - 1].end, tokens[at + k].start).replace(/\s+/g, '')
      if (gap !== entry.gaps[k - 1]) return false
    }
  }
  return true
}

function dedupe(targets: Target[]): Target[] {
  const seen = new Set<string>()
  return targets.filter((t) => {
    const key = targetKey(t)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function targetFromKey(key: TargetKey): Target | undefined {
  const parsed = parseTargetKey(key)
  return parsed ? { kind: parsed.kind as MentionKind, id: parsed.id, title: parsed.id } : undefined
}

/**
 * Edit distance where swapping two neighbours costs one, since that is
 * the typo fingers make most ("Daila" for "Dalia"). Abandoned early once
 * every path exceeds `limit`.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (a === b) return 0
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1][j] + 1, current[j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1)
      }
      current.push(value)
      if (value < rowMin) rowMin = value
    }
    if (rowMin > limit) return limit + 1
    rows.push(current)
  }
  return rows[a.length][b.length]
}

// ---------------------------------------------------------------------------
// The reverse index: everywhere each thing is named.
// ---------------------------------------------------------------------------

export interface MentionSite {
  /** The item doing the naming. */
  item: Target
  count: number
}

/** The text an item contributes to the index: a scene is its synopsis, beats, and prose; a page is its body. */
export function itemText(story: Story, key: TargetKey): string | undefined {
  const parsed = parseTargetKey(key)
  if (!parsed) return undefined
  if (parsed.kind === 'scene') {
    const scene = story.scenes.get(parsed.id)
    return scene && [scene.synopsis, ...scene.beats, scene.prose].join('\n\n')
  }
  if (parsed.kind === 'note') return story.notes.get(parsed.id)?.body
  const entity = story.references.get(parsed.id)
  return entity && entity.kind === parsed.kind ? entity.body : undefined
}

export function items(story: Story): Target[] {
  const list: Target[] = []
  for (const scene of story.scenes.values()) list.push({ kind: 'scene', id: scene.id, title: scene.title })
  for (const note of story.notes.values()) list.push({ kind: 'note', id: note.id, title: note.title })
  for (const entity of story.references.values()) list.push({ kind: entity.kind, id: entity.id, title: entity.title })
  return list
}

/** Per target, every item that names it, with how often — the variable ledger's shape, for names. */
export function mentionIndex(story: Story, dict: Dictionary = dictionary(story)): Map<TargetKey, MentionSite[]> {
  const index = new Map<TargetKey, MentionSite[]>()
  for (const item of items(story)) {
    const key = targetKey(item)
    const text = itemText(story, key)
    if (!text) continue
    const counts = new Map<TargetKey, number>()
    for (const span of findMentions(text, dict, { self: key, verdicts: story.verdicts[key] })) {
      if (span.certainty === 'probable') continue
      for (const target of span.targets) counts.set(targetKey(target), (counts.get(targetKey(target)) ?? 0) + 1)
    }
    for (const [target, count] of counts) {
      const sites = index.get(target) ?? []
      sites.push({ item, count })
      index.set(target, sites)
    }
  }
  return index
}
