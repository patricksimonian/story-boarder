import type { TargetKey } from '../domain/types'
import type { MentionKind, Span } from './match'

/**
 * What the prose editor needs from the app to draw mentions and answer
 * for them: a finder over plain text, a card per thing named, and the
 * two things a writer can do from the tooltip — go there, or rule on
 * what the phrase means. Built by the app per open item, since only
 * the app knows the story and which page the text belongs to.
 */
export interface MentionContext {
  find: (text: string) => Span[]
  describe: (key: TargetKey) => MentionCard | undefined
  onOpen: (key: TargetKey) => void
  /** The writer's ruling on a phrase in this item: means this, or nothing. */
  onVerdict: (quote: string, entity: TargetKey | null) => void
}

export interface MentionCard {
  key: TargetKey
  kind: MentionKind
  title: string
  /** What the tooltip says under the title — developments when there are any, otherwise how the page opens. */
  lines: string[]
  /** Titles of the nearest other items naming this thing. */
  others: string[]
  /** How many other items name it in all. */
  othersCount: number
}

export const KIND_LABEL: Record<MentionKind, string> = {
  character: 'Character',
  place: 'Place',
  lore: 'Lore',
  note: 'Note',
  scene: 'Scene',
  variable: 'Variable',
}
