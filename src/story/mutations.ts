import type { FileAccess } from '../adapters/types'
import type { Note, Playthrough, ReferenceKind, Scene, Slug, Storyline, StoryManifest, VariableRegistry } from '../domain/types'
import { parseManifestFile } from '../files/manifestFile'
import { serializeNoteFile } from '../files/noteFile'
import { serializeReferenceFile } from '../files/referenceFile'
import { parseSceneFile, serializeSceneFile } from '../files/sceneFile'

/**
 * Creation operations. Each reads the manifest fresh from disk, writes,
 * and leaves in-memory state alone — disk is the source of truth, so the
 * caller reloads and sees its own writes the same way it sees Notepad's.
 */

export function slugify(title: string, taken: (slug: Slug) => boolean): Slug {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  if (!taken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken(candidate)) return candidate
  }
}

/** Turns a bare folder into a story folder: a manifest with nothing in it yet, titled after the folder. */
export async function startStory(files: FileAccess, title: string): Promise<void> {
  await writeManifest(files, { title, acts: [], storylines: [], settings: {} })
}

/** Starts a page in the story's notebook; resolves to its slug. */
export async function createNote(files: FileAccess, title: string, section?: string): Promise<Slug> {
  const existing = new Set((await files.list('notes')).map((p) => p.slice('notes/'.length).replace(/\.md$/, '')))
  const id = slugify(title, (s) => existing.has(s))
  const note: Note = { id, title, tags: [], body: '' }
  if (section !== undefined && section !== '') note.section = section
  await files.writeText(`notes/${id}.md`, serializeNoteFile(note))
  return id
}

/** Where a reference kind's files live. */
export function referenceDir(kind: ReferenceKind): string {
  return kind === 'character' ? 'characters' : kind === 'place' ? 'places' : 'lore'
}

/** Starts a reference entity — a character, place, or lore page; resolves to its slug. */
export async function createReference(files: FileAccess, kind: ReferenceKind, title: string): Promise<Slug> {
  const dir = referenceDir(kind)
  const existing = new Set((await files.list(dir)).map((p) => p.slice(dir.length + 1).replace(/\.md$/, '')))
  const id = slugify(title, (s) => existing.has(s))
  await files.writeText(`${dir}/${id}.md`, serializeReferenceFile({ kind, id, title, tags: [], images: [], aliases: [], body: '' }))
  return id
}

/** Removes a reference entity's file. A scene citing it keeps the citation as written — the loader flags it. */
export async function deleteReference(files: FileAccess, kind: ReferenceKind, id: Slug): Promise<void> {
  await files.delete(`${referenceDir(kind)}/${id}.md`)
}

/** Lands an image's bytes under assets/, name slugged, extension kept; resolves to the story-relative path. */
export async function storeAsset(files: FileAccess, filename: string, bytes: Uint8Array): Promise<string> {
  const dot = filename.lastIndexOf('.')
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const existing = new Set((await files.list('assets')).map((p) => p.slice('assets/'.length)))
  const name = slugify(stem, (s) => existing.has(ext === '' ? s : `${s}.${ext}`))
  const path = `assets/${name}${ext === '' ? '' : `.${ext}`}`
  await files.writeBinary(path, bytes)
  return path
}

/** Sets or clears the story's word-count goal in the manifest's settings. */
export async function setWordGoal(files: FileAccess, storyWords: number | undefined): Promise<void> {
  const manifest = await readManifest(files)
  if (storyWords === undefined) {
    const { goals: _goals, ...rest } = manifest.settings
    manifest.settings = rest
  } else {
    manifest.settings = { ...manifest.settings, goals: { storyWords } }
  }
  await writeManifest(files, manifest)
}

/** Records a notebook section in the manifest, so an empty folder survives a reload. */
export async function addNotebookSection(files: FileAccess, path: string): Promise<void> {
  const manifest = await readManifest(files)
  const notebook = (manifest.settings.notebook ?? {}) as { sections?: unknown }
  const sections = Array.isArray(notebook.sections) ? (notebook.sections as string[]) : []
  if (sections.includes(path)) return
  manifest.settings = { ...manifest.settings, notebook: { ...notebook, sections: [...sections, path] } }
  await writeManifest(files, manifest)
}

/** Removes a note's file — nothing else references notes, so nothing dangles. */
export async function deleteNote(files: FileAccess, id: Slug): Promise<void> {
  await files.delete(`notes/${id}.md`)
}

/** Records which GitHub repository this story syncs with. The token never goes here. */
export async function setSyncRemote(files: FileAccess, remote: { owner: string; repo: string }): Promise<void> {
  const manifest = await readManifest(files)
  manifest.settings = { ...manifest.settings, sync: remote }
  await writeManifest(files, manifest)
}

export interface NewScene {
  title: string
  storylines: Slug[]
  act?: Slug
}

export async function createScene(files: FileAccess, spec: NewScene): Promise<Slug> {
  const existing = new Set(
    (await files.list('scenes')).map((p) => p.slice('scenes/'.length).replace(/\.md$/, '')),
  )
  const slug = slugify(spec.title, (s) => existing.has(s))
  await files.writeText(
    `scenes/${slug}.md`,
    serializeSceneFile({
      id: slug,
      title: spec.title,
      storylines: spec.storylines,
      act: spec.act,
      tags: [],
      characters: [],
      images: [],
      effects: [],
      choices: [],
      synopsis: '',
      beats: [],
      prose: '',
    }),
  )
  if (spec.storylines.length) {
    const manifest = await readManifest(files)
    for (const id of spec.storylines) {
      manifest.storylines.find((s) => s.id === id)?.scenes.push(slug)
    }
    await writeManifest(files, manifest)
  }
  return slug
}

export async function createAct(files: FileAccess, title: string): Promise<Slug> {
  const manifest = await readManifest(files)
  const id = slugify(title, (s) => manifest.acts.some((a) => a.id === s))
  manifest.acts.push({ id, title })
  await writeManifest(files, manifest)
  return id
}

export interface NewStoryline {
  name: string
  color: string
  glyph: string
}

export async function createStoryline(files: FileAccess, spec: NewStoryline): Promise<Slug> {
  const manifest = await readManifest(files)
  const id = slugify(spec.name, (s) => manifest.storylines.some((l) => l.id === s))
  manifest.storylines.push({ id, ...spec, scenes: [] })
  await writeManifest(files, manifest)
  return id
}

// ---------------------------------------------------------------------------
// Structure: storylines and acts. Ids never change — renaming is display only.
// ---------------------------------------------------------------------------

export type StorylineIdentity = Pick<Storyline, 'name' | 'color' | 'glyph'>

export async function updateStoryline(
  files: FileAccess,
  id: Slug,
  patch: Partial<StorylineIdentity>,
): Promise<void> {
  const manifest = await readManifest(files)
  const storyline = manifest.storylines.find((s) => s.id === id)
  if (!storyline) throw new Error(`No storyline \`${id}\``)
  Object.assign(storyline, patch)
  await writeManifest(files, manifest)
}

/** Moves a storyline to lane position `toIndex` (0-based, in manifest order). */
export async function moveStoryline(files: FileAccess, id: Slug, toIndex: number): Promise<void> {
  const manifest = await readManifest(files)
  manifest.storylines = moveItem(manifest.storylines, (s) => s.id === id, toIndex)
  await writeManifest(files, manifest)
}

/**
 * Removes a storyline. Every member scene loses that membership in its own
 * file; one left with no memberships floats to the idea pool. Scene files
 * that don't parse are left alone — they're flagged already.
 */
export async function deleteStoryline(files: FileAccess, id: Slug): Promise<void> {
  const manifest = await readManifest(files)
  const storyline = manifest.storylines.find((s) => s.id === id)
  if (!storyline) throw new Error(`No storyline \`${id}\``)
  for (const sceneId of storyline.scenes) {
    await editSceneFile(files, sceneId, (scene) => ({
      ...scene,
      storylines: scene.storylines.filter((s) => s !== id),
    }))
  }
  manifest.storylines = manifest.storylines.filter((s) => s.id !== id)
  await writeManifest(files, manifest)
}

export async function renameAct(files: FileAccess, id: Slug, title: string): Promise<void> {
  const manifest = await readManifest(files)
  const act = manifest.acts.find((a) => a.id === id)
  if (!act) throw new Error(`No act \`${id}\``)
  act.title = title
  await writeManifest(files, manifest)
}

/** Moves an act to column position `toIndex` (0-based, in manifest order). */
export async function moveAct(files: FileAccess, id: Slug, toIndex: number): Promise<void> {
  const manifest = await readManifest(files)
  manifest.acts = moveItem(manifest.acts, (a) => a.id === id, toIndex)
  await writeManifest(files, manifest)
}

/**
 * Removes an act — only an empty one. Scenes still in it would have to go
 * somewhere, and where is the writer's call, so the act refuses until
 * they've been moved out.
 */
export async function deleteAct(files: FileAccess, id: Slug): Promise<void> {
  const manifest = await readManifest(files)
  if (!manifest.acts.some((a) => a.id === id)) throw new Error(`No act \`${id}\``)
  const held = [...(await readScenes(files)).values()].filter((s) => s.act === id).length
  if (held > 0) {
    throw new Error(`This act still holds ${held} ${held === 1 ? 'scene' : 'scenes'} — move them out first.`)
  }
  manifest.acts = manifest.acts.filter((a) => a.id !== id)
  await writeManifest(files, manifest)
}

// ---------------------------------------------------------------------------
// Placement — an attachment, never a type change (spec: the domain model).
// ---------------------------------------------------------------------------

export interface Placement {
  /** Every membership the scene should have afterwards; empty floats it to the pool. */
  storylines: Slug[]
  act?: Slug
  /**
   * An exact slot in one lane: the index in that storyline's order with
   * the scene itself taken out. Other lanes seat the scene by act.
   */
  at?: { storyline: Slug; index: number }
}

/**
 * Sets a scene's memberships and act in its file and in every storyline's
 * order at once, so the two can't disagree. A lane the scene is joining
 * (or staying in while its act changes) seats it after the last scene
 * whose act comes at or before the new one, keeping lane order in step
 * with act order; a lane it already sits in keeps its slot.
 */
export async function placeScene(files: FileAccess, id: Slug, placement: Placement): Promise<void> {
  const manifest = await readManifest(files)
  const scenes = await readScenes(files)
  const scene = scenes.get(id)
  if (!scene) throw new Error(`No scene \`${id}\``)

  const actRank = new Map(manifest.acts.map((a, i) => [a.id, i]))
  const rankOf = (act: Slug | undefined) => (act === undefined ? -1 : (actRank.get(act) ?? -1))
  const targetRank = rankOf(placement.act)
  const actChanged = scene.act !== placement.act

  for (const storyline of manifest.storylines) {
    const rest = storyline.scenes.filter((s) => s !== id)
    if (!placement.storylines.includes(storyline.id)) {
      storyline.scenes = rest
      continue
    }
    const wasMember = storyline.scenes.includes(id)
    if (placement.at?.storyline === storyline.id) {
      rest.splice(Math.max(0, Math.min(placement.at.index, rest.length)), 0, id)
    } else if (wasMember && !actChanged) {
      continue
    } else {
      let seat = 0
      rest.forEach((s, i) => {
        if (rankOf(scenes.get(s)?.act) <= targetRank) seat = i + 1
      })
      rest.splice(seat, 0, id)
    }
    storyline.scenes = rest
  }

  await files.writeText(
    `scenes/${id}.md`,
    serializeSceneFile({ ...scene, storylines: placement.storylines, act: placement.act }),
  )
  await writeManifest(files, manifest)
}

/**
 * Removes a scene: the file goes and every storyline's order drops the
 * slug. Choices elsewhere that pointed at it are left as written — the
 * loader flags them, and cutting a link is the writer's call.
 */
export async function deleteScene(files: FileAccess, id: Slug): Promise<void> {
  const manifest = await readManifest(files)
  for (const storyline of manifest.storylines) {
    storyline.scenes = storyline.scenes.filter((s) => s !== id)
  }
  await files.delete(`scenes/${id}.md`)
  await writeManifest(files, manifest)
}

// ---------------------------------------------------------------------------
// The engine's files: the registry and saved playthroughs.
// ---------------------------------------------------------------------------

export async function saveRegistry(files: FileAccess, registry: VariableRegistry): Promise<void> {
  await files.writeText('variables.json', JSON.stringify(registry, null, 2) + '\n')
}

/** Writes a playthrough as `playthroughs/<slug-of-name>.json`; the same name overwrites. */
export async function savePlaythrough(files: FileAccess, playthrough: Playthrough): Promise<string> {
  const path = `playthroughs/${slugify(playthrough.name, () => false)}.json`
  await files.writeText(path, JSON.stringify(playthrough, null, 2) + '\n')
  return path
}

export async function deletePlaythrough(files: FileAccess, name: string): Promise<void> {
  await files.delete(`playthroughs/${slugify(name, () => false)}.json`)
}

/** Every scene file that parses, by slug. */
async function readScenes(files: FileAccess): Promise<Map<Slug, Scene>> {
  const scenes = new Map<Slug, Scene>()
  for (const path of await files.list('scenes')) {
    if (!path.endsWith('.md')) continue
    const id = path.slice('scenes/'.length, -'.md'.length)
    const result = parseSceneFile(id, await files.readText(path))
    if (result.ok) scenes.set(id, result.scene)
  }
  return scenes
}

function moveItem<T>(list: T[], is: (item: T) => boolean, toIndex: number): T[] {
  const from = list.findIndex(is)
  if (from < 0) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item)
  return next
}

/** Rewrites one scene file through parse → change → serialize; a missing or malformed file is skipped. */
async function editSceneFile(files: FileAccess, id: Slug, change: (scene: Scene) => Scene): Promise<void> {
  const path = `scenes/${id}.md`
  if (!(await files.exists(path))) return
  const result = parseSceneFile(id, await files.readText(path))
  if (!result.ok) return
  await files.writeText(path, serializeSceneFile(change(result.scene)))
}

async function readManifest(files: FileAccess): Promise<StoryManifest> {
  const result = parseManifestFile(await files.readText('story.json'))
  if (!result.ok) {
    throw new Error('story.json is malformed — fix it before creating anything new.')
  }
  return result.manifest
}

export async function writeManifest(files: FileAccess, manifest: StoryManifest): Promise<void> {
  await files.writeText('story.json', JSON.stringify(manifest, null, 2) + '\n')
}
