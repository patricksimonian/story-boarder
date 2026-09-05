import { useState } from 'react'
import type { LiftSuggestion } from '../interchange/lift'
import { Dialog } from './CreateDialog'

/** The import door: pick a file, the content decides what it is. */
export function ImportDialog({ onFile, onCancel }: { onFile: (file: File) => void; onCancel: () => void }) {
  return (
    <Dialog label="Import a story file">
      <p>
        Twee (.twee, .tw), published Twine HTML or an archive, a Plottr .pltr, or a playable export
        from this app — the file's content decides, not its name.
      </p>
      <label>
        Story file to import
        <input
          type="file"
          aria-label="Story file to import"
          accept=".twee,.tw,.html,.htm,.pltr,.json"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </label>
      <div className="create-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  )
}

/**
 * The lifting offer after a Twine import: each macro that translates
 * into this app's engine, checked by default, applied only on say-so.
 * The original text stays in the prose either way.
 */
export function LiftDialog({
  suggestions,
  onApply,
  onKeep,
}: {
  suggestions: LiftSuggestion[]
  onApply: (chosen: LiftSuggestion[]) => void
  onKeep: () => void
}) {
  const [checked, setChecked] = useState(() => suggestions.map(() => true))

  return (
    <Dialog label="Lift into the engine">
      <p>
        These macros translate into conditions and effects this app can simulate. Applied ones land
        on their scenes and choices — the macro text stays in the prose either way.
      </p>
      <ul className="lift-list">
        {suggestions.map((suggestion, i) => (
          <li key={i}>
            <label>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) => setChecked(checked.map((c, j) => (j === i ? e.target.checked : c)))}
              />
              <span>
                {suggestion.description}
                <code>{suggestion.source}</code>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="create-actions">
        <button type="button" onClick={() => onApply(suggestions.filter((_, i) => checked[i]))}>
          Apply selected
        </button>
        <button type="button" onClick={onKeep}>
          Keep everything as prose
        </button>
      </div>
    </Dialog>
  )
}
