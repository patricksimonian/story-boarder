import type { Story } from '../domain/types'

/**
 * One tag, one spelling. A tag is written in its canonical form — lower
 * case, words joined by hyphens, nothing but letters, digits, and
 * hyphens — so NPC, npc, and Npc are the same tag. And a tag that only
 * differs from one the story already uses by a plural folds into it, so
 * a story that has `human` never grows a `humans` beside it.
 */
export function canonicalTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The forms a tag might also have been written in: its plural and its singular, roughly. */
function variants(tag: string): string[] {
  const out = new Set<string>([tag])
  if (tag.endsWith('ies')) out.add(`${tag.slice(0, -3)}y`)
  if (tag.endsWith('es')) out.add(tag.slice(0, -2))
  if (tag.endsWith('s') && !tag.endsWith('ss')) out.add(tag.slice(0, -1))
  if (tag.endsWith('y')) out.add(`${tag.slice(0, -1)}ies`)
  out.add(`${tag}s`)
  out.add(`${tag}es`)
  return [...out]
}

/** The canonical tag, folded into the story's own spelling when the story already has a variant of it. */
export function foldTag(raw: string, existing: Iterable<string>): string {
  const canon = canonicalTag(raw)
  if (!canon) return ''
  const have = new Set([...existing].map(canonicalTag))
  if (have.has(canon)) return canon
  for (const variant of variants(canon)) if (have.has(variant)) return variant
  return canon
}

/** Every tag the story uses, in canonical form, with how many things carry it, most used first. */
export function tagIndex(story: Story): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  const add = (tags: string[]) => {
    for (const raw of tags) {
      const tag = canonicalTag(raw)
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  for (const scene of story.scenes.values()) add(scene.tags)
  for (const note of story.notes.values()) add(note.tags)
  for (const entity of story.references.values()) add(entity.tags)
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
