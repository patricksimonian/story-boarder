import type { Slug, Story } from '../domain/types'

/**
 * Writing stats, computed fresh from the loaded story — nothing stored,
 * nothing to go stale. A scene's count is its prose; synopsis and beats
 * are planning, not writing.
 */

export interface EntryCount {
  id: Slug
  title: string
  words: number
}

export interface StoryStats {
  /** Prose words across every scene — the story's word count. */
  sceneWords: number
  scenes: EntryCount[]
  notes: EntryCount[]
  references: EntryCount[]
}

export function countWords(text: string): number {
  const words = text.split(/\s+/).filter(Boolean)
  return words.length
}

export function storyStats(story: Story): StoryStats {
  const scenes = [...story.scenes.values()]
    .map((s) => ({ id: s.id, title: s.title, words: countWords(s.prose) }))
    .sort((a, b) => b.words - a.words || a.title.localeCompare(b.title))
  const notes = [...story.notes.values()]
    .map((n) => ({ id: n.id, title: n.title, words: countWords(n.body) }))
    .sort((a, b) => b.words - a.words || a.title.localeCompare(b.title))
  const references = [...story.references.values()]
    .map((r) => ({ id: r.id, title: r.title, words: countWords(r.body) }))
    .sort((a, b) => b.words - a.words || a.title.localeCompare(b.title))
  return {
    sceneWords: scenes.reduce((sum, s) => sum + s.words, 0),
    scenes,
    notes,
    references,
  }
}
