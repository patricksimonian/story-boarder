import type { TargetKey } from '../domain/types'
import type { MentionKind, Span, Target } from './match'

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
  /** A story-folder image as something an <img> can show, or null when it cannot be read. */
  imageUrl?: (path: string) => Promise<string | null>
  /** Makes the thing an orange name asks for — a page, a scene, a note — with that name. */
  onCreate?: (kind: 'character' | 'place' | 'lore' | 'scene' | 'note', title: string) => void
  /** What the read thought an orange name should be, when it said. */
  suggestedKind?: (quote: string) => string | undefined
  /** Every page, scene, note, and variable the story has, for "it is something that exists". */
  everything?: () => Target[]
  /** Keeps a phrase as a name for a page, so the matcher finds it from then on. */
  onAlias?: (key: TargetKey, alias: string) => void
}

export interface MentionCard {
  key: TargetKey
  kind: MentionKind
  title: string
  /** What the collapsed card says under the title — developments when there are any, otherwise how the page opens. */
  lines: string[]
  /** Titles of the nearest other items naming this thing. */
  others: string[]
  /** How many other items name it in all. */
  othersCount: number
  /** The whole page, as text, for the expanded card. */
  body: string
  tags: string[]
  aliases: string[]
  /** Every development recorded about it, in story order, with where. */
  developments: { item: Target; fact: string; quote: string }[]
  /** Every item that names it, nearest first, each a place to go. */
  namedIn: Target[]
  /** The mood board: story-folder-relative paths under assets/. */
  images: string[]
}

export const KIND_LABEL: Record<MentionKind, string> = {
  character: 'Character',
  place: 'Place',
  lore: 'Lore',
  note: 'Note',
  scene: 'Scene',
  variable: 'Variable',
}
