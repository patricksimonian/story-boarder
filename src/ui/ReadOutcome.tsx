import type { EditorNote } from '../assistant/ledger'

/**
 * What the last read of this page found, shown where the writer pressed
 * Read: when it ran and what it recorded, the editor's notes with the
 * fixes the app can apply, then the developments themselves. A read
 * that found nothing says so rather than leaving the button to settle
 * back in silence.
 */
export interface ReadInfo {
  summary: string
  notes: ReadNote[]
  developments: { title: string; fact: string; quote: string }[]
}

export interface ReadNote extends EditorNote {
  /** The title behind the entity key, when there is one. */
  entityTitle?: string
  /** The fix the app can apply for this note, when it can. */
  action?: { label: string; run: () => void }
}

const KIND_LABEL: Record<EditorNote['kind'], string> = {
  continuity: 'Continuity',
  'loose-end': 'Loose end',
  define: 'Undefined',
  other: 'Note',
}

const NOUN: Record<NonNullable<EditorNote['defineAs']>, string> = {
  character: 'character page',
  place: 'place page',
  lore: 'lore page',
  scene: 'scene',
  note: 'note',
  variable: 'variable',
}

/** What is the case, in one shape: the thing, and what does not describe it. */
function defineHeadline(note: ReadNote): string | null {
  if (note.kind !== 'define') return null
  if (note.entity) return `${note.entityTitle ?? note.entity} is on this page but not listed on the scene.`
  if (!note.name) return null
  const noun = note.defineAs ? NOUN[note.defineAs] : 'page, scene, note, or variable'
  return `${note.name}: mentioned, but no ${noun} describes it.`
}

export function ReadOutcome({ read }: { read?: ReadInfo | null }) {
  if (!read) return null
  return (
    <div className="read-outcome" role="region" aria-label="Last read">
      <p className="read-summary">{read.summary}</p>
      {read.notes.length > 0 && (
        <ul className="read-notes" aria-label="Editor’s notes">
          {read.notes.map((note, i) => (
            <li key={i} className={`read-note ${note.kind}`}>
              <span className="read-kind">{KIND_LABEL[note.kind]}</span>
              <span className="read-message" title={note.quote}>
                {defineHeadline(note) ? (
                  <>
                    <strong>{defineHeadline(note)}</strong> {note.message}
                  </>
                ) : (
                  note.message
                )}
              </span>
              {note.quote && <q className="read-quote">{note.quote}</q>}
              {note.action && (
                <button type="button" className="goto" onClick={note.action.run}>
                  {note.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {read.developments.length > 0 && (
        <ul className="read-developments">
          {read.developments.map((d, i) => (
            <li key={i}>
              <span className="read-entity">{d.title}</span> <span title={d.quote}>{d.fact}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
