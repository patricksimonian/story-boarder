import type { FileAccess } from '../adapters/types'
import type { Note, Playthrough, ReferenceEntity, ReferenceKind, Scene, Story, StoryManifest } from '../domain/types'
import { parseManifestFile } from '../files/manifestFile'
import { parseNoteFile } from '../files/noteFile'
import { parseReferenceFile } from '../files/referenceFile'
import { parseRegistryFile } from '../files/registryFile'
import { parseSceneFile } from '../files/sceneFile'

/** One flagged file: what's wrong, plus the raw text so it can be edited in place. */
export interface FileProblem {
  path: string
  message: string
  raw: string
}

export interface LoadedStory {
  story: Story
  problems: FileProblem[]
}

export type LoadStoryResult =
  | { ok: true; loaded: LoadedStory }
  | { ok: false; reason: string }

const REFERENCE_DIRS: [string, ReferenceKind][] = [
  ['characters', 'character'],
  ['places', 'place'],
  ['lore', 'lore'],
]

/**
 * Reads a whole story folder. Malformed files are flagged and excluded,
 * never repaired or dropped silently; only a missing story.json refuses
 * the folder outright.
 */
export async function loadStory(files: FileAccess): Promise<LoadStoryResult> {
  if (!(await files.exists('story.json'))) {
    return { ok: false, reason: 'This folder has no story.json — not a story folder.' }
  }

  const problems: FileProblem[] = []
  const flag = (path: string, messages: string[], raw: string) => {
    problems.push({ path, message: messages.join('; '), raw })
  }

  const manifestRaw = await files.readText('story.json')
  const manifestResult = parseManifestFile(manifestRaw)
  let manifest: StoryManifest
  if (manifestResult.ok) {
    manifest = manifestResult.manifest
  } else {
    flag('story.json', manifestResult.problems, manifestRaw)
    manifest = { title: 'Untitled story', acts: [], storylines: [], settings: {} }
  }

  const scenes = new Map<string, Scene>()
  for (const path of await mdFiles(files, 'scenes')) {
    const slug = slugOf(path)
    const raw = await files.readText(path)
    const result = parseSceneFile(slug, raw)
    if (result.ok) scenes.set(slug, result.scene)
    else flag(path, result.problems, raw)
  }

  const references = new Map<string, ReferenceEntity>()
  for (const entity of await loadReferences(files, flag)) references.set(entity.id, entity)

  const notes = new Map<string, Note>()
  for (const path of await mdFiles(files, 'notes')) {
    const slug = slugOf(path)
    const raw = await files.readText(path)
    const result = parseNoteFile(slug, raw)
    if (result.ok) notes.set(slug, result.note)
    else flag(path, result.problems, raw)
  }

  let registry = { variables: [] as Story['registry']['variables'] }
  if (await files.exists('variables.json')) {
    const raw = await files.readText('variables.json')
    const result = parseRegistryFile(raw)
    if (result.ok) registry = result.registry
    else flag('variables.json', result.problems, raw)
  }

  const playthroughs = await loadPlaythroughs(files, flag)

  crossCheck(manifest, scenes, flag)

  return {
    ok: true,
    loaded: { story: { manifest, scenes, references, notes, registry, playthroughs }, problems },
  }
}

/** Manifest order and scene memberships must tell the same story. */
function crossCheck(
  manifest: StoryManifest,
  scenes: Map<string, Scene>,
  flag: (path: string, messages: string[], raw: string) => void,
): void {
  const storylineIds = new Set(manifest.storylines.map((s) => s.id))
  const actIds = new Set(manifest.acts.map((a) => a.id))

  for (const storyline of manifest.storylines) {
    for (const id of storyline.scenes) {
      if (!scenes.has(id)) {
        flag('story.json', [`Storyline \`${storyline.id}\` lists \`${id}\`, but scenes/${id}.md doesn't exist or is malformed`], '')
      }
    }
  }
  for (const scene of scenes.values()) {
    const path = `scenes/${scene.id}.md`
    for (const membership of scene.storylines) {
      if (!storylineIds.has(membership)) {
        flag(path, [`Scene claims storyline \`${membership}\`, which story.json doesn't declare`], '')
      } else if (!manifest.storylines.find((s) => s.id === membership)?.scenes.includes(scene.id)) {
        flag(path, [`Scene claims storyline \`${membership}\`, but that storyline's order doesn't list it`], '')
      }
    }
    if (scene.act !== undefined && !actIds.has(scene.act)) {
      flag(path, [`Scene claims act \`${scene.act}\`, which story.json doesn't declare`], '')
    }
    for (const choice of scene.choices) {
      if (!scenes.has(choice.to)) {
        flag(path, [`Choice "${choice.label}" leads to \`${choice.to}\`, which doesn't exist — deleted, renamed, or never written`], '')
      }
    }
  }
}

async function loadReferences(
  files: FileAccess,
  flag: (path: string, messages: string[], raw: string) => void,
): Promise<ReferenceEntity[]> {
  const entities: ReferenceEntity[] = []
  for (const [dir, kind] of REFERENCE_DIRS) {
    for (const path of await mdFiles(files, dir)) {
      const raw = await files.readText(path)
      const result = parseReferenceFile(kind, slugOf(path), raw)
      if (result.ok) entities.push(result.entity)
      else flag(path, result.problems, raw)
    }
  }
  return entities
}

async function loadPlaythroughs(
  files: FileAccess,
  flag: (path: string, messages: string[], raw: string) => void,
): Promise<Playthrough[]> {
  const playthroughs: Playthrough[] = []
  for (const path of await files.list('playthroughs')) {
    if (!path.endsWith('.json')) continue
    const raw = await files.readText(path)
    try {
      const data = JSON.parse(raw) as Playthrough
      if (typeof data.name !== 'string' || !Array.isArray(data.steps)) throw new Error('needs `name` and `steps`')
      playthroughs.push(data)
    } catch (error) {
      flag(path, [`Not a valid playthrough: ${(error as Error).message}`], raw)
    }
  }
  return playthroughs
}

async function mdFiles(files: FileAccess, dir: string): Promise<string[]> {
  return (await files.list(dir)).filter((path) => path.endsWith('.md')).sort()
}

function slugOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base.replace(/\.md$/, '')
}
