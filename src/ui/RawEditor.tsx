/**
 * Raw editing for flagged files: the text exactly as it is on disk,
 * never repaired behind the writer's back.
 */
export function RawEditor({
  path,
  message,
  text,
  dirty,
  onChange,
  onSave,
  onClose,
}: {
  path: string
  message: string
  text: string
  dirty: boolean
  onChange: (text: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <section className="raw-editor" aria-label={`Raw editor for ${path}`}>
      <div className="raw-head">
        <h3>
          <code>{path}</code>
        </h3>
        <p className="raw-message">{message}</p>
      </div>
      <textarea
        aria-label="Raw file"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="raw-actions">
        <button className="raw-save" onClick={onSave} disabled={!dirty}>
          Save
        </button>
        <button className="raw-close" onClick={onClose}>
          {dirty ? 'Discard and close' : 'Close'}
        </button>
      </div>
    </section>
  )
}
