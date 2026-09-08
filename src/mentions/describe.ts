import type { Story, TargetKey } from '../domain/types'
import type { MentionCard } from './context'
import type { MentionSite } from './match'
import { parseTargetKey } from './verdicts'

/**
 * The card behind a mention: what the thing is, how its page opens, and
 * where else the story names it. Developments from the ledger take the
 * place of the page excerpt when the scene read has produced any.
 */
export function describeTarget(
  story: Story,
  key: TargetKey,
  from: TargetKey,
  index: Map<TargetKey, MentionSite[]>,
  developments: string[] = [],
): MentionCard | undefined {
  const parsed = parseTargetKey(key)
  if (!parsed) return undefined
  const sites = (index.get(key) ?? []).filter((site) => `${site.item.kind}:${site.item.id}` !== from)
  sites.sort((a, b) => b.count - a.count || a.item.title.localeCompare(b.item.title))
  const others = sites.slice(0, 3).map((site) => site.item.title)
  const base = { key, others, othersCount: sites.length }

  if (parsed.kind === 'scene') {
    const scene = story.scenes.get(parsed.id)
    if (!scene) return undefined
    return { ...base, kind: 'scene', title: scene.title, lines: developments.length ? developments : excerpt(scene.synopsis) }
  }
  if (parsed.kind === 'note') {
    const note = story.notes.get(parsed.id)
    if (!note) return undefined
    return { ...base, kind: 'note', title: note.title, lines: developments.length ? developments : excerpt(note.body) }
  }
  if (parsed.kind === 'variable') {
    const variable = story.registry.variables.find((v) => v.id === parsed.id)
    if (!variable) return undefined
    const lines = [`${variable.type}, starts at ${String(variable.initial)}`]
    if (variable.description) lines.push(variable.description)
    return { ...base, kind: 'variable', title: variable.id, lines }
  }
  const entity = story.references.get(parsed.id)
  if (!entity || entity.kind !== parsed.kind) return undefined
  return { ...base, kind: entity.kind, title: entity.title, lines: developments.length ? developments : excerpt(entity.body) }
}

/** The first paragraph, cut at a sentence end before it runs long. */
function excerpt(body: string): string[] {
  const first = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+ +/, '').replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!first) return []
  if (first.length <= 180) return [first]
  const cut = first.slice(0, 180)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return [end > 60 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`]
}
