import type { Act, Storyline, StoryManifest } from '../domain/types'

export type ManifestParseResult =
  | { ok: true; manifest: StoryManifest }
  | { ok: false; problems: string[] }

/** Parses `story.json` — the manifest that identifies a story folder. */
export function parseManifestFile(text: string): ManifestParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { ok: false, problems: [`Not valid JSON: ${(error as Error).message}`] }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, problems: ['story.json must be a JSON object'] }
  }

  const problems: string[] = []
  const record = data as Record<string, unknown>

  if (typeof record.title !== 'string') problems.push('`title` must be a string')

  const acts: Act[] = []
  eachEntry(record.acts, 'acts', problems, (entry, at) => {
    if (typeof entry.id !== 'string' || typeof entry.title !== 'string') {
      problems.push(`\`${at}\` needs string \`id\` and \`title\``)
      return
    }
    acts.push({ id: entry.id, title: entry.title })
  })

  const storylines: Storyline[] = []
  eachEntry(record.storylines, 'storylines', problems, (entry, at) => {
    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.color !== 'string' ||
      typeof entry.glyph !== 'string'
    ) {
      problems.push(`\`${at}\` needs string \`id\`, \`name\`, \`color\`, and \`glyph\``)
      return
    }
    const scenes = entry.scenes
    if (!Array.isArray(scenes) || scenes.some((s) => typeof s !== 'string')) {
      problems.push(`\`${at}.scenes\` must be a list of scene ids`)
      return
    }
    storylines.push({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      glyph: entry.glyph,
      scenes: scenes as string[],
    })
  })

  flagDuplicates(acts.map((a) => a.id), 'acts', problems)
  flagDuplicates(storylines.map((s) => s.id), 'storylines', problems)

  const settings =
    typeof record.settings === 'object' && record.settings !== null && !Array.isArray(record.settings)
      ? (record.settings as Record<string, unknown>)
      : {}

  if (problems.length) return { ok: false, problems }
  return { ok: true, manifest: { title: record.title as string, acts, storylines, settings } }
}

function eachEntry(
  value: unknown,
  field: string,
  problems: string[],
  use: (entry: Record<string, unknown>, at: string) => void,
): void {
  if (!Array.isArray(value)) {
    problems.push(`\`${field}\` must be a list`)
    return
  }
  value.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      problems.push(`\`${field}[${i}]\` must be an object`)
      return
    }
    use(entry as Record<string, unknown>, `${field}[${i}]`)
  })
}

function flagDuplicates(ids: string[], field: string, problems: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) problems.push(`Duplicate id \`${id}\` in \`${field}\``)
    seen.add(id)
  }
}
