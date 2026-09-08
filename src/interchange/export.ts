import type { FileAccess } from '../adapters/types'
import { loadStory } from '../story/loadStory'
import { slugify } from '../story/mutations'

/**
 * The playable export, on Twine's compile model: one HTML file holding
 * the story as JSON in a script island, the eval-free runtime inlined
 * beside it, and nothing fetched from anywhere — it must play from
 * file://. In both islands `<` is escaped as < (still valid JSON),
 * so no prose can close the script tag or open a comment. A second,
 * inert island carries the story folder's files verbatim: any export
 * re-imports losslessly, the Twine data-island trick.
 */

const escapeJson = (json: string) => json.replace(/</g, '\\u003c')

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderPlayable(
  title: string,
  storyJson: string,
  source: Record<string, string>,
  runtimeJs: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #f4f1ea; color: #2a2722; font: 17px/1.6 Georgia, 'Times New Roman', serif; }
  #player { max-width: 640px; margin: 0 auto; padding: 40px 20px 80px; }
  #player h1 { font-size: 24px; }
  #player h2 { font-size: 19px; margin: 28px 0 8px; }
  #player .scene { border-top: 1px solid #d8d4cc; padding-top: 8px; }
  #player .choices { display: grid; gap: 8px; margin-top: 20px; }
  #player button { font: inherit; text-align: left; padding: 10px 14px; border: 1px solid #b9b2a4; border-radius: 8px; background: #fff; cursor: pointer; }
  #player button:hover { border-color: #5b6ee1; }
  #player button:disabled { opacity: 0.55; cursor: default; }
  #player .closed { font-size: 14px; opacity: 0.7; }
  #player .ended { margin-top: 24px; font-style: italic; }
</style>
</head>
<body>
<script type="application/json" id="story-data">${escapeJson(storyJson)}</script>
<script type="application/json" id="storyline-source">${escapeJson(JSON.stringify(source))}</script>
<div id="player"></div>
<script>${runtimeJs}</script>
</body>
</html>
`
}

/** The story folder's files back out of an export's source island, or null when there is none. */
export function playableToStoryFiles(html: string): Record<string, string> | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const island = doc.querySelector('script#storyline-source[type="application/json"]')
  if (!island) return null
  try {
    const parsed = JSON.parse(island.textContent ?? '') as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    for (const value of Object.values(parsed)) if (typeof value !== 'string') return null
    return parsed as Record<string, string>
  } catch {
    return null
  }
}

/** Decodes UTF-8 strictly: a file that isn't text comes back null. */
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
function asText(bytes: Uint8Array): string | null {
  try {
    return strictUtf8.decode(bytes)
  } catch {
    return null
  }
}

/**
 * Every text file in the folder as path → text, the repository excluded.
 * Files that aren't UTF-8 text — the mood board's images under assets/ —
 * stay out: the island exists so an export re-imports losslessly, and
 * bytes read as text never came back as the same bytes. (The browser's
 * lossy decode used to bloat an export by megabytes per image; the
 * desktop shell refuses to read such a file as text at all.)
 */
export async function collectSource(files: FileAccess, dir = ''): Promise<Record<string, string>> {
  const source: Record<string, string> = {}
  for (const path of await files.list(dir)) {
    if (path.endsWith('.crswap')) continue // Chromium's swap files are not story content
    const text = asText(await files.readBinary(path))
    if (text !== null) source[path] = text
  }
  for (const folder of await files.listFolders(dir)) {
    // exports/ is derived output — embedding old exports in new ones
    // would compound the file forever.
    if (folder === '.git' || folder === 'exports') continue
    Object.assign(source, await collectSource(files, folder))
  }
  return source
}

export type ExportResult = { ok: true; html: string; name: string } | { ok: false; reason: string }

export async function exportPlayable(files: FileAccess, runtimeJs: string): Promise<ExportResult> {
  const result = await loadStory(files)
  if (!result.ok) return { ok: false, reason: result.reason }
  const { story } = result.loaded

  const storyJson = JSON.stringify({
    manifest: story.manifest,
    scenes: [...story.scenes.values()],
    registry: story.registry,
  })
  const html = renderPlayable(story.manifest.title, storyJson, await collectSource(files), runtimeJs)
  return { ok: true, html, name: slugify(story.manifest.title, () => false) }
}
