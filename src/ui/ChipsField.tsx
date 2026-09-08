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
}) {
  const [text, setText] = useState('')

  const commit = () => {
    const next = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => !values.some((v) => v.toLowerCase() === t.toLowerCase()))
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
      </div>
    </div>
  )
}
