import type { Slug } from '../domain/types'

/** Where the board is zoomed — or one of the tabs beside it. View state lives in the URL hash. */
export type View =
  | { level: 'storylines' }
  | { level: 'overview' }
  | { level: 'graph' }
  | { level: 'variables' }
  | { level: 'simulate' }
  | { level: 'analysis' }
  | { level: 'history' }
  | { level: 'sync' }
  | { level: 'notes' }
  | { level: 'library' }
  | { level: 'search' }
  | { level: 'stats' }
  | { level: 'coach' }
  | { level: 'act'; act: Slug }

type Flat = Exclude<View, { level: 'act' }>['level']
const FLAT: Flat[] = ['storylines', 'overview', 'graph', 'variables', 'simulate', 'analysis', 'history', 'sync', 'notes', 'library', 'search', 'stats', 'coach']

export function readViewFromHash(hash: string, isAct: (id: Slug) => boolean): View {
  const match = hash.match(/view=(storylines|overview|graph|variables|simulate|analysis|history|sync|notes|library|search|stats|coach|act:([a-z0-9-]+))/)
  if (!match) return { level: 'storylines' }
  if (match[2]) return isAct(match[2]) ? { level: 'act', act: match[2] } : { level: 'storylines' }
  return { level: FLAT.find((f) => f === match[1]) ?? 'storylines' }
}

/** The scene open in the slide-over editor, when the hash names one that exists. */
export function readSceneFromHash(hash: string, isScene: (id: Slug) => boolean): Slug | undefined {
  const match = hash.match(/scene=([a-z0-9-]+)/)
  return match && isScene(match[1]) ? match[1] : undefined
}

export function viewToHash(view: View, scene?: Slug): string {
  const base = `#view=${view.level === 'act' ? `act:${view.act}` : view.level}`
  return scene === undefined ? base : `${base}&scene=${scene}`
}
