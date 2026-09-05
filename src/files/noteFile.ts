import type { Note, Slug } from '../domain/types'
import { readTitle, splitFrontmatter } from './frontmatter'

/**
 * One `notes/<slug>.md` per Note: frontmatter (id, optional section,
 * tags), a `# Title` heading, then the body — freeform writing, no
 * structure imposed. The section is a frontmatter field on purpose:
 * regrouping edits one line and never moves a file.
 */

export type NoteParseResult = { ok: true; note: Note } | { ok: false; problems: string[] }

export function parseNoteFile(slug: Slug, text: string): NoteParseResult {
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

  let section: string | undefined
  if (fm.section !== undefined) {
    if (typeof fm.section === 'string') section = fm.section
    else problems.push('`section` must be a string')
  }

  const tags = fm.tags ?? []
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    problems.push('`tags` must be a list of strings')
  }

  const title = readTitle(split.body)
  if (title === undefined) problems.push('Body has no `# Title` heading')

  if (problems.length) return { ok: false, problems }
  const body = split.body.replace(/^# +.+$/m, '').trim()
  const note: Note = { id: slug, title: title as string, tags: tags as string[], body }
  if (section !== undefined) note.section = section
  return { ok: true, note }
}

/** Writes a note as its on-disk Markdown. Empty fields stay out of the frontmatter. */
export function serializeNoteFile(note: Note): string {
  const sectionLine = note.section === undefined ? '' : `\nsection: ${note.section}`
  const tagLine = note.tags.length ? `\ntags: [${note.tags.join(', ')}]` : ''
  const body = note.body === '' ? '' : `\n\n${note.body}`
  return `---\nid: ${note.id}${sectionLine}${tagLine}\n---\n\n# ${note.title}${body}\n`
}
