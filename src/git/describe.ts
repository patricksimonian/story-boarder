import type { Scene } from '../domain/types'
import { parseManifestFile } from '../files/manifestFile'
import { parseSceneFile } from '../files/sceneFile'

/**
 * Generated commit messages. One phrase per changed file — "Edit scene:
 * The Dry Cistern — prose +240 words, 2 beats added" — the first two
 * joined with '; ', anything further folded into '+N more'. Checkpoint
 * commits carry the writer's own words instead; this is for the commits
 * the app makes on its own at natural boundaries.
 */

export interface FileChange {
  path: string
  /** The file at the last commit, or null when it's new. */
  before: string | null
  /** The file now, or null when it's gone. */
  after: string | null
}

export function describeChanges(changes: FileChange[]): string {
  const phrases = changes.flatMap(phrasesFor)
  if (phrases.length === 0) return 'Save'
  const lead = phrases.slice(0, 2).join('; ')
  return phrases.length > 2 ? `${lead}; +${phrases.length - 2} more` : lead
}

const slugOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')

function phrasesFor(change: FileChange): string[] {
  const { path } = change
  if (path.startsWith('scenes/') && path.endsWith('.md')) return [scenePhrase(change)]
  if (path === 'story.json') return manifestPhrases(change)
  if (path === 'variables.json') return variablePhrases(change)
  const reference = { 'characters/': 'character', 'places/': 'place', 'lore/': 'lore', 'notes/': 'note' }
  for (const [dir, kind] of Object.entries(reference)) {
    if (path.startsWith(dir) && path.endsWith('.md')) return [referencePhrase(change, kind)]
  }
  if (path.startsWith('playthroughs/') && path.endsWith('.json')) return [playthroughPhrase(change)]
  if (change.before === null) return [`Add ${path}`]
  if (change.after === null) return [`Delete ${path}`]
  return [`Edit ${path}`]
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

function parsedScene(path: string, text: string | null): Scene | null {
  if (text === null) return null
  const result = parseSceneFile(slugOf(path), text)
  return result.ok ? result.scene : null
}

const engineOf = (scene: Scene) =>
  JSON.stringify([scene.condition ?? null, scene.effects, scene.choices, scene.chance ?? null])

function scenePhrase(change: FileChange): string {
  const before = parsedScene(change.path, change.before)
  const after = parsedScene(change.path, change.after)
  if (change.before === null) return `New scene: ${after?.title ?? slugOf(change.path)}`
  if (change.after === null) return `Delete scene: ${before?.title ?? slugOf(change.path)}`
  if (!before || !after) return `Edit ${change.path}`

  const details: string[] = []
  const grown = words(after.prose) - words(before.prose)
  if (grown !== 0) details.push(`prose ${grown > 0 ? '+' : '-'}${plural(Math.abs(grown), 'word')}`)
  const beats = after.beats.length - before.beats.length
  if (beats > 0) details.push(`${plural(beats, 'beat')} added`)
  else if (beats < 0) details.push(`${plural(-beats, 'beat')} removed`)
  else if (JSON.stringify(after.beats) !== JSON.stringify(before.beats)) details.push('beats edited')
  if (after.synopsis !== before.synopsis) details.push('synopsis edited')
  if (engineOf(after) !== engineOf(before)) details.push('engine changed')
  if (after.title !== before.title) details.push('retitled')

  return `Edit scene: ${after.title}${details.length ? ` — ${details.join(', ')}` : ''}`
}

function manifestPhrases(change: FileChange): string[] {
  const parse = (text: string | null) => {
    if (text === null) return null
    const result = parseManifestFile(text)
    return result.ok ? result.manifest : null
  }
  const before = parse(change.before)
  const after = parse(change.after)
  if (change.before === null) return [`New story: ${after?.title ?? 'Untitled'}`]
  if (!before || !after) return [`Edit ${change.path}`]

  const phrases: string[] = []
  const beforeLines = new Map(before.storylines.map((s) => [s.id, s]))
  const afterLines = new Map(after.storylines.map((s) => [s.id, s]))
  for (const [id, line] of afterLines) if (!beforeLines.has(id)) phrases.push(`New storyline: ${line.name}`)
  for (const [id, line] of beforeLines) if (!afterLines.has(id)) phrases.push(`Delete storyline: ${line.name}`)
  const beforeActs = new Map(before.acts.map((a) => [a.id, a]))
  const afterActs = new Map(after.acts.map((a) => [a.id, a]))
  for (const [id, act] of afterActs) if (!beforeActs.has(id)) phrases.push(`New act: ${act.title}`)
  for (const [id, act] of beforeActs) if (!afterActs.has(id)) phrases.push(`Delete act: ${act.title}`)
  if (after.title !== before.title) phrases.push(`Retitle story: ${after.title}`)

  if (phrases.length === 0) {
    const shape = (m: typeof before) => JSON.stringify([m.acts, m.storylines])
    phrases.push(shape(after) === shape(before) ? 'Story settings' : 'Rearrange the board')
  }
  return phrases
}

function variablePhrases(change: FileChange): string[] {
  const ids = (text: string | null): Set<string> | null => {
    if (text === null) return new Set()
    try {
      const parsed = JSON.parse(text) as { variables?: { id?: unknown }[] }
      return new Set((parsed.variables ?? []).map((v) => String(v.id)))
    } catch {
      return null
    }
  }
  const before = ids(change.before)
  const after = ids(change.after)
  if (!before || !after) return ['Edit variables']

  const phrases: string[] = []
  for (const id of after) if (!before.has(id)) phrases.push(`New variable: ${id}`)
  for (const id of before) if (!after.has(id)) phrases.push(`Delete variable: ${id}`)
  return phrases.length ? phrases : ['Edit variables']
}

function referencePhrase(change: FileChange, kind: string): string {
  const title = (change.after ?? change.before ?? '').match(/^# (.+)$/m)?.[1] ?? slugOf(change.path)
  const verb = change.before === null ? 'New' : change.after === null ? 'Delete' : 'Edit'
  return `${verb} ${kind}: ${title}`
}

function playthroughPhrase(change: FileChange): string {
  const name = (() => {
    try {
      const parsed = JSON.parse(change.after ?? change.before ?? '{}') as { name?: unknown }
      return typeof parsed.name === 'string' ? parsed.name : slugOf(change.path)
    } catch {
      return slugOf(change.path)
    }
  })()
  return change.after === null ? `Delete playthrough: ${name}` : `Save playthrough: ${name}`
}
