import type { Scene } from '../domain/types'
import { serializeReferenceFile } from '../files/referenceFile'
import { serializeSceneFile } from '../files/sceneFile'
import { slugify } from '../story/mutations'
import { GLYPHS } from '../ui/glyphs'
import { colorForName } from '../ui/storylineColor'

/**
 * Plottr's .pltr: one JSON document, a serialized Redux store. The
 * importer branches on `file.version` — the v1 era (≤1.3) spoke a
 * different vocabulary and is declined readably; the 2020 era holds
 * beats as a flat array; 2021.4.13 turned them into a per-book tree of
 * children/heap/index. Unknown keys are ignored, never rewritten:
 * Plottr's later development is closed-source, so leniency is the only
 * honest posture. Plottr has no branching or variables — an import
 * seeds structure, prose, and reference entities, and the engine is
 * authored here afterward.
 */

export type PltrResult = { ok: true; files: Record<string, string> } | { ok: false; reason: string }

interface PltrBeat {
  id: number
  bookId?: number | string
  position?: number
  title?: string
}

interface PltrCard {
  id: number
  lineId?: number | null
  beatId?: number | null
  positionWithinLine?: number
  title?: string
  description?: unknown
  tags?: number[]
  characters?: number[]
  places?: number[]
}

interface PltrFile {
  file?: { version?: string }
  series?: { name?: string }
  books?: Record<string, { id?: number; title?: string } | number[] | undefined> & { allIds?: number[] }
  beats?: unknown
  lines?: { id: number; bookId?: number | string; color?: string; title?: string; position?: number }[]
  cards?: PltrCard[]
  characters?: { id: number; name?: string; description?: unknown; notes?: unknown }[]
  places?: { id: number; name?: string; description?: unknown; notes?: unknown }[]
  tags?: { id: number; title?: string }[]
}

export function pltrToStoryFiles(text: string): PltrResult {
  let data: PltrFile
  try {
    data = JSON.parse(text) as PltrFile
  } catch {
    return { ok: false, reason: 'Not a .pltr file — the content is not JSON.' }
  }

  const version = data.file?.version
  if (version !== undefined && /^[01]\./.test(version)) {
    return {
      ok: false,
      reason: `This .pltr was written by Plottr ${version} — the v1 era speaks a different shape. Open and re-save it in a newer Plottr first.`,
    }
  }

  const bookId = data.books?.allIds?.[0] ?? 1
  const book = data.books?.[String(bookId)] as { title?: string } | undefined
  const title = book?.title || data.series?.name || 'Imported story'

  const beats = orderedBeats(data.beats, bookId)
  const takenActs = new Set<string>()
  const acts = beats.map((beat, i) => {
    const actTitle = !beat.title || beat.title === 'auto' ? `Chapter ${i + 1}` : beat.title
    const id = slugify(actTitle, (s) => takenActs.has(s))
    takenActs.add(id)
    return { id, title: actTitle, beatId: beat.id, order: i }
  })
  const actByBeat = new Map(acts.map((a) => [a.beatId, a]))

  const lines = (data.lines ?? [])
    .filter((line) => line.bookId === undefined || line.bookId === bookId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const takenLines = new Set<string>()
  const storylines = lines.map((line, i) => {
    const name = line.title || `Plotline ${i + 1}`
    const id = slugify(name, (s) => takenLines.has(s))
    takenLines.add(id)
    return { lineId: line.id, id, name, color: line.color || colorForName(name, []), glyph: GLYPHS[i % GLYPHS.length] }
  })
  const storylineByLine = new Map(storylines.map((s) => [s.lineId, s]))

  const tagTitles = new Map((data.tags ?? []).map((t) => [t.id, t.title ?? '']))
  const files: Record<string, string> = {}

  // Reference entities first, so scenes can cite their slugs.
  const characterSlugs = writeReferences(files, 'character', 'characters', data.characters ?? [])
  writeReferences(files, 'place', 'places', data.places ?? [])

  const takenScenes = new Set<string>()
  const placed = new Map<string, string[]>(storylines.map((s) => [s.id, []]))
  const cards = [...(data.cards ?? [])].sort((a, b) => {
    const beatOf = (c: PltrCard) => actByBeat.get(c.beatId ?? -1)?.order ?? Number.MAX_SAFE_INTEGER
    return beatOf(a) - beatOf(b) || (a.positionWithinLine ?? 0) - (b.positionWithinLine ?? 0)
  })
  for (const card of cards) {
    const slug = slugify(card.title || 'scene', (s) => takenScenes.has(s))
    takenScenes.add(slug)
    const storyline = card.lineId === null || card.lineId === undefined ? undefined : storylineByLine.get(card.lineId)
    if (storyline) placed.get(storyline.id)?.push(slug)

    const scene: Scene = {
      id: slug,
      title: card.title || 'Scene',
      storylines: storyline ? [storyline.id] : [],
      act: actByBeat.get(card.beatId ?? -1)?.id,
      tags: (card.tags ?? []).map((id) => tagTitles.get(id)).filter((t): t is string => !!t),
      characters: (card.characters ?? []).map((id) => characterSlugs.get(id)).filter((s): s is string => !!s),
      condition: undefined,
      effects: [],
      choices: [],
      chance: undefined,
      images: [],
      synopsis: '',
      beats: [],
      prose: slateText(card.description),
    }
    files[`scenes/${slug}.md`] = serializeSceneFile(scene)
  }

  files['story.json'] = JSON.stringify(
    {
      title,
      acts: acts.map(({ id, title: actTitle }) => ({ id, title: actTitle })),
      storylines: storylines.map(({ id, name, color, glyph }) => ({
        id,
        name,
        color,
        glyph,
        scenes: placed.get(id) ?? [],
      })),
      settings: {},
    },
    null,
    2,
  )
  return { ok: true, files }
}

/** Top-level beats for one book, in position order — tree era or flat era. */
function orderedBeats(beats: unknown, bookId: number | string): PltrBeat[] {
  if (Array.isArray(beats)) {
    return (beats as PltrBeat[])
      .filter((b) => b.bookId === undefined || b.bookId === bookId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }
  const tree = (beats as Record<string, { children?: Record<string, number[]>; index?: Record<string, PltrBeat> }> | undefined)?.[
    String(bookId)
  ]
  if (!tree?.children || !tree.index) return []
  const top = tree.children['null'] ?? []
  return top
    .map((id) => tree.index?.[String(id)])
    .filter((b): b is PltrBeat => b !== undefined)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

function writeReferences(
  files: Record<string, string>,
  kind: 'character' | 'place',
  dir: string,
  entities: { id: number; name?: string; description?: unknown; notes?: unknown }[],
): Map<number, string> {
  const slugs = new Map<number, string>()
  const taken = new Set<string>()
  for (const entity of entities) {
    const entityTitle = entity.name || `${kind} ${entity.id}`
    const slug = slugify(entityTitle, (s) => taken.has(s))
    taken.add(slug)
    slugs.set(entity.id, slug)
    const body = [slateText(entity.description), slateText(entity.notes)].filter(Boolean).join('\n\n')
    files[`${dir}/${slug}.md`] = serializeReferenceFile({ kind, id: slug, title: entityTitle, tags: [], images: [], aliases: [], body })
  }
  return slugs
}

/**
 * Plottr rich text is a Slate node array; very old files hold plain
 * strings. Paragraphs join with blank lines; bold and italic keep their
 * emphasis; list items keep their dashes. Anything stranger flattens to
 * its text — prose survives, formatting is best-effort.
 */
function slateText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((node) => blockText(node as SlateNode))
    .filter(Boolean)
    .join('\n\n')
}

interface SlateNode {
  type?: string
  text?: string
  bold?: boolean
  italic?: boolean
  children?: SlateNode[]
}

function blockText(node: SlateNode): string {
  if (node.type === 'bulleted-list' || node.type === 'numbered-list') {
    return (node.children ?? [])
      .map((item, i) => `${node.type === 'numbered-list' ? `${i + 1}.` : '-'} ${inlineText(item)}`)
      .join('\n')
  }
  return inlineText(node)
}

function inlineText(node: SlateNode): string {
  if (node.text !== undefined) {
    let text = node.text
    if (node.bold && text.trim()) text = `**${text}**`
    if (node.italic && text.trim()) text = `*${text}*`
    return text
  }
  return (node.children ?? []).map(inlineText).join('')
}
