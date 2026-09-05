import { playableToStoryFiles } from './export'
import { liftSuggestions, type LiftSuggestion } from './lift'
import { pltrToStoryFiles } from './pltr'
import { parseTwee, twineToStoryFiles, type TwineStory } from './twee'
import { parseTwineHtml } from './twine-html'

/**
 * One door for every importable file. The content decides, not the
 * extension: a playable export's source island wins (it's this app's
 * own files, byte for byte), then a Twine HTML island, then JSON as
 * .pltr, then Twee. An archive holding several stories imports its
 * first — one story folder per import.
 */

export type ImportResult =
  | { ok: true; files: Record<string, string>; suggestions: LiftSuggestion[] }
  | { ok: false; reason: string }

export function importToFiles(fileName: string, text: string): ImportResult {
  const playable = playableToStoryFiles(text)
  if (playable) return { ok: true, files: playable, suggestions: [] }

  const twineStories = parseTwineHtml(text)
  if (twineStories.length > 0 && twineStories[0].passages.length > 0) return fromTwine(twineStories[0])

  if (text.trim().startsWith('{')) {
    const result = pltrToStoryFiles(text)
    return result.ok ? { ok: true, files: result.files, suggestions: [] } : result
  }

  const twee = parseTwee(text)
  if (twee.passages.length > 0) return fromTwine(twee)

  return {
    ok: false,
    reason: `Could not read ${fileName} as Twee, Twine HTML, a .pltr file, or a playable export.`,
  }
}

function fromTwine(twine: TwineStory): ImportResult {
  return { ok: true, files: twineToStoryFiles(twine), suggestions: liftSuggestions(twine) }
}
