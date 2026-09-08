import type { Story, TargetKey } from '../domain/types'
import type { MentionCard } from './context'
import type { MentionSite, Target } from './match'
import { parseTargetKey } from './verdicts'

export interface DevelopmentAbout {
  item: Target
  fact: string
  quote: string
}

/**
 * The card behind a mention: what the thing is, how its page opens, and
 * where else the story names it — and, for the expanded card, the whole
 * page with everything the ledger has recorded about it. Developments
 * take the place of the page excerpt on the collapsed card when the
 * scene read has produced any.
 */
export function describeTarget(
  story: Story,
  key: TargetKey,
  from: TargetKey,
  index: Map<TargetKey, MentionSite[]>,
  lines: string[] = [],
  developments: DevelopmentAbout[] = [],
): MentionCard | undefined {
  const parsed = parseTargetKey(key)
  if (!parsed) return undefined
  const sites = (index.get(key) ?? []).filter((site) => `${site.item.kind}:${site.item.id}` !== from)
  sites.sort((a, b) => b.count - a.count || a.item.title.localeCompare(b.item.title))
  const namedIn = sites.map((site) => site.item)
  const others = namedIn.slice(0, 3).map((item) => item.title)
  const base = { key, others, othersCount: sites.length, namedIn, developments, tags: [] as string[], aliases: [] as string[], images: [] as string[] }
  const said = (fallback: string) => (lines.length ? lines : excerpt(fallback))

  if (parsed.kind === 'scene') {
    const scene = story.scenes.get(parsed.id)
    if (!scene) return undefined
    const body = [scene.synopsis, ...scene.beats.map((b, i) => `${i + 1}. ${b}`)].filter(Boolean).join('\n\n')
    return { ...base, kind: 'scene', title: scene.title, lines: said(scene.synopsis), body, tags: scene.tags, images: scene.images }
  }
  if (parsed.kind === 'note') {
    const note = story.notes.get(parsed.id)
    if (!note) return undefined
    return { ...base, kind: 'note', title: note.title, lines: said(note.body), body: note.body, tags: note.tags }
  }
  if (parsed.kind === 'variable') {
    const variable = story.registry.variables.find((v) => v.id === parsed.id)
    if (!variable) return undefined
    const meta = `${variable.type}, starts at ${String(variable.initial)}`
    const summary = [meta, variable.description].filter((s): s is string => !!s)
    return { ...base, kind: 'variable', title: variable.id, lines: summary, body: summary.join('\n\n') }
  }
  const entity = story.references.get(parsed.id)
  if (!entity || entity.kind !== parsed.kind) return undefined
  return {
    ...base,
    kind: entity.kind,
    title: entity.title,
    lines: said(entity.body),
    body: entity.body,
    tags: entity.tags,
    aliases: entity.aliases,
    images: entity.images,
  }
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

/** A page's Markdown as paragraphs of plain text, for reading inside the card. */
export function pageParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/^#+ +/gm, '')
        .replace(/^\s*[-*] +/gm, '• ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}
