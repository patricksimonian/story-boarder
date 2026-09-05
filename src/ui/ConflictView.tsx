import { useState } from 'react'

/**
 * The one conflict case: a file changed on disk while the same file had
 * unsaved edits in the app. Side by side — pick one, or edit your pane
 * into a merge and keep it. Nothing is clobbered silently.
 */
export function ConflictView({
  path,
  diskText,
  appText,
  onResolve,
}: {
  path: string
  diskText: string
  appText: string
  onResolve: (choice: 'disk' | 'mine', mineText: string) => void
}) {
  const [mine, setMine] = useState(appText)
  return (
    <div className="conflict-backdrop">
      <div role="dialog" aria-label={`${path} changed on disk`} className="conflict">
        <h3>
          <code>{path}</code> changed on disk while you had unsaved edits
        </h3>
        <p className="conflict-sub">
          Pick a side, or edit your version below into a merge and keep it.
        </p>
        <div className="conflict-panes">
          <div className="conflict-pane">
            <h4>On disk</h4>
            <pre>{diskText}</pre>
            <button onClick={() => onResolve('disk', mine)}>Take the disk version</button>
          </div>
          <div className="conflict-pane">
            <h4>Yours (editable)</h4>
            <textarea
              aria-label="Your version"
              value={mine}
              onChange={(e) => setMine(e.target.value)}
              spellCheck={false}
            />
            <button onClick={() => onResolve('mine', mine)}>Keep my version</button>
          </div>
        </div>
      </div>
    </div>
  )
}
