import { useState } from 'react'

/**
 * A list of short values as pills: type one and press Enter (or a
 * comma) to add it, × or Backspace on an empty box to take one off.
 * Proposals — values something suggested — sit after the real ones as
 * dashed ghosts with a tick and a cross. Tags and aliases both live here.
 */
export function ChipsField({
  label,
  name,
  noun,
  values,
  onChange,
  placeholder,
  title,
  proposals = [],
  onAccept = () => {},
  onDismiss = () => {},
  proposalHint,
  normalize = (value) => value,
  suggestions = [],
}: {
  /** The words beside the field. */
  label: string
  /** The accessible name of the box: "Tags", "Aliases". */
  name: string
  /** The word in each pill's own labels: "tag", "alias". */
  noun: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  title?: string
  proposals?: string[]
  onAccept?: (value: string) => void
  onDismiss?: (value: string) => void
  proposalHint?: string
  /** The one form a value is written in — tags fold to the story's spelling here; aliases are left as typed. */
  normalize?: (value: string) => string
  /** Values to offer as the writer types. */
  suggestions?: string[]
}) {
  const [text, setText] = useState('')
  const listId = `chips-${noun}-suggestions`

  const commit = () => {
    const next: string[] = []
    for (const raw of text.split(',')) {
      const value = normalize(raw.trim())
      if (!value) continue
      if (values.some((v) => v.toLowerCase() === value.toLowerCase()) || next.some((v) => v.toLowerCase() === value.toLowerCase())) continue
      next.push(value)
    }
    setText('')
    if (next.length) onChange([...values, ...next])
  }

  return (
    <div className="notes-sectrow chips-row" title={title}>
      <span className="chips-label">{label}</span>
      <div className="chips-field" role="group" aria-label={name}>
        {values.map((value) => (
          <span key={value} className="chip">
            {value}
            <button type="button" aria-label={`Remove ${noun} ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              ×
            </button>
          </span>
        ))}
        {proposals.map((value) => (
          <span key={`ghost-${value}`} className="ghost-chip" title={proposalHint}>
            {value}
            <button type="button" aria-label={`Add ${noun} ${value}`} onClick={() => onAccept(value)}>
              ✓
            </button>
            <button type="button" aria-label={`Dismiss ${noun} ${value}`} onClick={() => onDismiss(value)}>
              ×
            </button>
          </span>
        ))}
        <input
          className="chips-input"
          aria-label={name}
          list={suggestions.length ? listId : undefined}
          placeholder={values.length === 0 ? placeholder : ''}
          value={text}
          onChange={(e) => {
            if (e.target.value.includes(',')) {
              setText(e.target.value)
              queueMicrotask(commit)
            } else setText(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
              e.preventDefault()
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={commit}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  )
}
