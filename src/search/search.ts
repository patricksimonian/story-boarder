import type { Slug, Story } from '../domain/types'

/**
 * Full-text search across everything the story holds. There is no
 * index: the loaded story is already every file in memory, and a linear
 * scan over even a large story is faster than a keystroke. Words are
 * ANDed — each must land somewhere in the same entry — and a title hit
 * outranks a body hit.
 */

export type SearchKind = 'scene' | 'note' | 'character' | 'place' | 'lore'

export interface SearchHit {
  kind: SearchKind
  id: Slug
  title: string
  /** Where the first word landed, windowed around the match. */
  snippet: string
}

interface Entry {
  kind: SearchKind
  id: Slug
  title: string
  body: string
}

export function searchStory(story: Story, query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const entries: Entry[] = []
  for (const scene of story.scenes.values()) {
    entries.push({
      kind: 'scene',
      id: scene.id,
      title: scene.title,
      body: [scene.synopsis, ...scene.beats, scene.prose, scene.tags.join(' ')].join('\n'),
    })
  }
  for (const note of story.notes.values()) {
    entries.push({ kind: 'note', id: note.id, title: note.title, body: [note.body, note.tags.join(' ')].join('\n') })
  }
  for (const entity of story.references.values()) {
    entries.push({ kind: entity.kind, id: entity.id, title: entity.title, body: [entity.body, entity.tags.join(' ')].join('\n') })
  }

  const hits: (SearchHit & { rank: number })[] = []
  for (const entry of entries) {
    const title = entry.title.toLowerCase()
    const body = entry.body.toLowerCase()
    if (!words.every((w) => title.includes(w) || body.includes(w))) continue
    const inTitle = words.some((w) => title.includes(w))
    hits.push({
      kind: entry.kind,
      id: entry.id,
      title: entry.title,
      snippet: snippet(entry, words[0]),
      rank: inTitle ? 0 : 1,
    })
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .map((hit) => ({ kind: hit.kind, id: hit.id, title: hit.title, snippet: hit.snippet }))
}

/** A window of text around the first word's first landing, title hits windowing the body's own match if any. */
function snippet(entry: Entry, word: string): string {
  const at = entry.body.toLowerCase().indexOf(word)
  if (at < 0) return entry.body.slice(0, 80).trim()
  const start = Math.max(0, at - 40)
  const raw = entry.body.slice(start, at + word.length + 40).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${raw}…`
}
