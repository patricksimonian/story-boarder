import { parse } from 'yaml'

export type FrontmatterSplit =
  | { ok: true; data: unknown; body: string }
  | { ok: false; problem: string }

/**
 * Splits a Markdown file into its YAML frontmatter and body. The file must
 * open with `---` on the first line and close the block with another.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { ok: false, problem: 'File must open with a `---` frontmatter block' }
  }
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) {
    return { ok: false, problem: 'Frontmatter block never closes (missing `---`)' }
  }
  const yamlText = normalized.slice(4, end + 1)
  const body = normalized.slice(normalized.indexOf('\n', end + 1) + 1)
  try {
    return { ok: true, data: parse(yamlText) ?? {}, body }
  } catch (error) {
    return { ok: false, problem: `Frontmatter is not valid YAML: ${(error as Error).message}` }
  }
}

/** The first `# Heading` in the body is the display title. */
export function readTitle(body: string): string | undefined {
  const match = body.match(/^# +(.+?) *$/m)
  return match?.[1]
}

/** Splits the body into `## Section` chunks, keyed by lowercased heading. */
export function readSections(body: string): Map<string, string> {
  const sections = new Map<string, string>()
  const pattern = /^## +(.+?) *$/gm
  const headings: { name: string; contentStart: number; headingStart: number }[] = []
  for (const match of body.matchAll(pattern)) {
    headings.push({
      name: match[1].toLowerCase(),
      headingStart: match.index,
      contentStart: match.index + match[0].length,
    })
  }
  headings.forEach((h, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].headingStart : body.length
    sections.set(h.name, body.slice(h.contentStart, end).trim())
  })
  return sections
}
