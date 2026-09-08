import type { Story, TargetKey, Verdict } from '../domain/types'
import { phraseKey, targetKey } from '../mentions/verdicts'
import type { Target } from '../mentions/match'

/**
 * The development ledger: what the scene read said about each item, kept
 * by the hash of the text it read, so an unchanged scene is never sent
 * again and a whole-story pass costs one call per changed scene. It is
 * machine output and stays out of the story folder — the folder holds
 * only what the writer confirmed. Losing it costs one re-read.
 */

export interface LedgerMention {
  quote: string
  entity: TargetKey
}

export interface LedgerRejection {
  quote: string
  candidate: TargetKey
  why: string
}

export interface Development {
  entity: TargetKey
  /** One plain sentence about the story world. */
  fact: string
  /** The writer's own sentence, verbatim. */
  quote: string
}

export type DefineKind = 'character' | 'place' | 'lore' | 'scene' | 'note' | 'variable'

/**
 * An editor's note on the page: one sentence, quoted, of a kind,
 * sometimes with a fix the app can apply. A `define` note is the one
 * that catches what does not exist yet: anything the read judges the
 * story should hold as a first-class thing — a page, a scene, a note,
 * a variable — named as written, with the kind it should be.
 */
export interface EditorNote {
  kind: 'continuity' | 'loose-end' | 'define' | 'other'
  message: string
  quote: string
  /** The thing it concerns, when it concerns one the story already has. */
  entity?: TargetKey
  /** For a define note: the thing as written on the page. */
  name?: string
  /** For a define note: what it should be. */
  defineAs?: DefineKind
  /** For a define note proposing a variable: its shape. */
  variable?: { id: string; type: 'boolean' | 'number' | 'enum'; initial: string; description: string }
  /** An effect the page performs that the engine does not, as an expression. */
  effect?: string
}

export interface LedgerEntry {
  hash: string
  readAt: number
  mentions: LedgerMention[]
  rejected: LedgerRejection[]
  developments: Development[]
  /** Absent on entries from before the editor's notes existed. */
  notes?: EditorNote[]
}

/** Per item, keyed like a target: `scene:cold-city`, `note:timeline`. */
export type Ledger = Record<TargetKey, LedgerEntry>

/** FNV-1a over the text, with its length, as hex: enough to tell "unchanged" from "changed". */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}-${text.length.toString(16)}`
}

export interface LedgerStore {
  load(story: string): Ledger
  save(story: string, ledger: Ledger): void
}

const KEY = (story: string) => `storyline-app:ledger:${story}`

/**
 * The ledger in the page's own storage: under the app data directory on
 * the desktop (WebView2 keeps its storage there), beside the journal's
 * database in a browser. Wrapped, because storage can be refused.
 */
export function localLedgerStore(storage: () => Storage = () => localStorage): LedgerStore {
  return {
    load(story) {
      try {
        const raw = storage().getItem(KEY(story))
        const parsed: unknown = raw === null ? {} : JSON.parse(raw)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Ledger) : {}
      } catch {
        return {}
      }
    },
    save(story, ledger) {
      try {
        storage().setItem(KEY(story), JSON.stringify(ledger))
      } catch {
        // Nothing lost that a re-read cannot recover.
      }
    },
  }
}

export function memoryLedgerStore(): LedgerStore {
  const held = new Map<string, Ledger>()
  return {
    load: (story) => held.get(story) ?? {},
    save: (story, ledger) => void held.set(story, ledger),
  }
}

/** What a read said the story should define and has not, as written — drawn in orange until it exists or the writer says it is nothing. */
export function modelUnknowns(entry: LedgerEntry | undefined): string[] {
  if (!entry?.notes) return []
  return entry.notes.filter((n) => n.kind === 'define' && !n.entity && n.name).map((n) => n.name as string)
}

/** What the read decided about phrases in the item, as verdicts the matcher draws: mentions resolved, candidates refused. */
export function modelVerdicts(entry: LedgerEntry | undefined): Verdict[] {
  if (!entry) return []
  return [
    ...entry.mentions.map((m): Verdict => ({ quote: m.quote, entity: m.entity, by: 'model' })),
    ...entry.rejected.map((r): Verdict => ({ quote: r.quote, entity: null, by: 'model' })),
  ]
}

/** One line for the page a read came from: when, and what it recorded, or that it recorded nothing. */
export function readSummary(entry: LedgerEntry | undefined, now: number = Date.now()): string | null {
  if (!entry) return null
  const ago = now - entry.readAt
  const when =
    ago < 60_000 ? 'just now' : ago < 3_600_000 ? `${Math.round(ago / 60_000)} min ago` : ago < 86_400_000 ? `${Math.round(ago / 3_600_000)} h ago` : `${Math.round(ago / 86_400_000)} d ago`
  const parts: string[] = []
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  if (entry.notes?.length) parts.push(n(entry.notes.length, 'editor’s note', 'editor’s notes'))
  const missing = entry.notes?.filter((note) => note.kind === 'define' && !note.entity).length ?? 0
  if (missing) parts.push(n(missing, 'thing to define', 'things to define'))
  if (entry.developments.length) parts.push(n(entry.developments.length, 'development', 'developments'))
  if (entry.mentions.length) parts.push(n(entry.mentions.length, 'phrase resolved', 'phrases resolved'))
  if (entry.rejected.length) parts.push(n(entry.rejected.length, 'name refused', 'names refused'))
  return `Read ${when}: ${parts.length ? parts.join(', ') : 'nothing to record'}`
}

export interface DevelopmentSite {
  item: Target
  fact: string
  quote: string
}

/**
 * Every item in story order: each storyline's scenes in lane order (a
 * scene in two lanes counts where it first appears), then the loose
 * scenes, then the notes, then the library's pages — the order the
 * ledger is read back in, and the order a whole-story read goes.
 */
export function storyOrder(story: Story): Target[] {
  const seen = new Set<string>()
  const order: Target[] = []
  const push = (target: Target) => {
    const key = targetKey(target)
    if (seen.has(key)) return
    seen.add(key)
    order.push(target)
  }
  for (const storyline of story.manifest.storylines) {
    for (const id of storyline.scenes) {
      const scene = story.scenes.get(id)
      if (scene) push({ kind: 'scene', id, title: scene.title })
    }
  }
  for (const scene of [...story.scenes.values()].sort((a, b) => a.title.localeCompare(b.title))) {
    push({ kind: 'scene', id: scene.id, title: scene.title })
  }
  for (const note of [...story.notes.values()].sort((a, b) => a.title.localeCompare(b.title))) {
    push({ kind: 'note', id: note.id, title: note.title })
  }
  for (const entity of [...story.references.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))) {
    push({ kind: entity.kind, id: entity.id, title: entity.title })
  }
  return order
}

/** An entity's developments across the story, in story order. */
export function developmentsFor(ledger: Ledger, story: Story, entity: TargetKey): DevelopmentSite[] {
  const sites: DevelopmentSite[] = []
  for (const item of storyOrder(story)) {
    const entry = ledger[targetKey(item)]
    if (!entry) continue
    for (const d of entry.developments) if (d.entity === entity) sites.push({ item, fact: d.fact, quote: d.quote })
  }
  return sites
}

/** Every entity the ledger has developments for, with them, titled and sorted. */
export function developmentLog(ledger: Ledger, story: Story, titleOf: (key: TargetKey) => string | undefined): { entity: TargetKey; title: string; sites: DevelopmentSite[] }[] {
  const keys = new Set<TargetKey>()
  for (const entry of Object.values(ledger)) for (const d of entry.developments) keys.add(d.entity)
  return [...keys]
    .map((entity) => ({ entity, title: titleOf(entity) ?? entity, sites: developmentsFor(ledger, story, entity) }))
    .filter((row) => row.sites.length > 0)
    .sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * What the tooltip says about an entity from inside one item: this item's
 * developments about it, then the last one before it in story order.
 */
export function developmentLines(ledger: Ledger, story: Story, entity: TargetKey, item: TargetKey): string[] {
  const all = developmentsFor(ledger, story, entity)
  const here = all.filter((site) => targetKey(site.item) === item).slice(0, 2)
  const lines = here.map((site) => site.fact)
  const order = storyOrder(story).map(targetKey)
  const at = order.indexOf(item)
  const before = all.filter((site) => {
    const i = order.indexOf(targetKey(site.item))
    return i >= 0 && (at < 0 || i < at)
  })
  const last = before[before.length - 1]
  if (last) lines.push(`Before, in ${last.item.title}: ${last.fact}`)
  return lines
}

const PRONOUNS = new Set(['he', 'she', 'they', 'it', 'him', 'her', 'them', 'his', 'hers', 'theirs', 'its', 'who', 'himself', 'herself', 'themselves', 'i', 'me', 'you', 'we', 'us'])

/**
 * Phrases the read resolved that are worth keeping as aliases: a noun
 * phrase, not a pronoun, that names the same entity in two or more items
 * and is not already its title or one of its aliases. Once accepted, the
 * matcher finds it on the next keystroke with no model in the loop.
 */
export function aliasProposals(ledger: Ledger, story: Story): Map<TargetKey, string[]> {
  const known = new Map<TargetKey, Set<string>>()
  for (const entity of story.references.values()) {
    known.set(targetKey(entity), new Set([entity.title, ...entity.aliases].map(phraseKey)))
  }
  const seen = new Map<string, { entity: TargetKey; quote: string; items: Set<string> }>()
  for (const [item, entry] of Object.entries(ledger)) {
    for (const mention of entry.mentions) {
      const names = known.get(mention.entity)
      if (!names) continue
      const key = phraseKey(mention.quote)
      if (!key || names.has(key) || PRONOUNS.has(key) || key.split(' ').every((w) => PRONOUNS.has(w))) continue
      const id = `${mention.entity}|${key}`
      const row = seen.get(id) ?? { entity: mention.entity, quote: mention.quote, items: new Set<string>() }
      row.items.add(item)
      seen.set(id, row)
    }
  }
  const proposals = new Map<TargetKey, string[]>()
  for (const row of seen.values()) {
    if (row.items.size < 2) continue
    const list = proposals.get(row.entity) ?? []
    list.push(row.quote)
    proposals.set(row.entity, list)
  }
  for (const list of proposals.values()) list.sort((a, b) => a.localeCompare(b))
  return proposals
}
