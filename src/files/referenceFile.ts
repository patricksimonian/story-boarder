import type { ReferenceEntity, ReferenceKind, Slug } from '../domain/types'
import { readTitle, splitFrontmatter } from './frontmatter'

export type ReferenceParseResult =
  | { ok: true; entity: ReferenceEntity }
  | { ok: false; problems: string[] }

/** Parses one file from `characters/`, `places/`, or `lore/`. */
export function parseReferenceFile(kind: ReferenceKind, slug: Slug, text: string): ReferenceParseResult {
  const split = splitFrontmatter(text)
  if (!split.ok) return { ok: false, problems: [split.problem] }

  const problems: string[] = []
  const fm =
    typeof split.data === 'object' && split.data !== null && !Array.isArray(split.data)
      ? (split.data as Record<string, unknown>)
      : undefined
  if (!fm) return { ok: false, problems: ['Frontmatter must be a YAML mapping'] }

  if (fm.id === undefined) problems.push('Frontmatter is missing `id`')
  else if (fm.id !== slug) problems.push(`Frontmatter id \`${String(fm.id)}\` doesn't match the filename \`${slug}\``)

  const tags = fm.tags ?? []
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    problems.push('`tags` must be a list of strings')
  }

  const images = fm.images ?? []
  if (!Array.isArray(images) || images.some((p) => typeof p !== 'string')) {
    problems.push('`images` must be a list of strings')
  }

  const title = readTitle(split.body)
  if (title === undefined) problems.push('Body has no `# Title` heading')

  if (problems.length) return { ok: false, problems }
  const body = split.body.replace(/^# +.+$/m, '').trim()
  return {
    ok: true,
    entity: { kind, id: slug, title: title as string, tags: tags as string[], images: images as string[], body },
  }
}

/** Writes a reference entity as its on-disk Markdown. */
export function serializeReferenceFile(entity: ReferenceEntity): string {
  const tagLine = entity.tags.length ? `\ntags: [${entity.tags.join(', ')}]` : ''
  const imageLine = entity.images.length ? `\nimages: [${entity.images.join(', ')}]` : ''
  const body = entity.body === '' ? '' : `\n\n${entity.body}`
  return `---\nid: ${entity.id}${tagLine}${imageLine}\n---\n\n# ${entity.title}${body}\n`
}
