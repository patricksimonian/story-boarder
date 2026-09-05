import { useEffect, useState } from 'react'
import type { GitClient, GitCommit } from '../adapters/types'
import { Dialog } from './CreateDialog'

/**
 * The story's commit history, newest first — every boundary commit and
 * checkpoint the app has made for this folder. Browsing the whole repo
 * file by file is what GitHub's own UI is for; this list is the writer's
 * timeline.
 */
const PAGE = 50

export function HistoryView({ git }: { git: GitClient }) {
  const [limit, setLimit] = useState(PAGE)
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  useEffect(() => {
    // One past the page, so the button knows whether older commits exist.
    void git.log({ limit: limit + 1 }).then(setCommits)
  }, [git, limit])

  const shown = (commits ?? []).slice(0, limit)
  const older = (commits?.length ?? 0) > limit

  return (
    <section className="hist-wrap" role="region" aria-label="History">
      <div className="view-bar">
        <h2>History</h2>
      </div>
      {commits?.length === 0 && <p className="hist-empty">No commits yet — the first boundary makes one.</p>}
      <ol className="hist-list">
        {shown.map((commit) => (
          <li key={commit.id}>
            <span className="hist-msg">{commit.message}</span>
            <span className="hist-time">{new Date(commit.time * 1000).toLocaleString()}</span>
            <span className="hist-author">{commit.author}</span>
          </li>
        ))}
      </ol>
      {older && (
        <button
          className="mt-2 rounded-md border border-line bg-card px-3 py-1.5"
          onClick={() => setLimit(limit + PAGE)}
        >
          Show 50 older
        </button>
      )}
    </section>
  )
}

export function CheckpointDialog({
  onCommit,
  onClose,
}: {
  /** Resolves to the commit id — or null when the folder holds nothing new. */
  onCommit: (message: string) => Promise<string | null>
  onClose: () => void
}) {
  const [message, setMessage] = useState('')
  const [nothingNew, setNothingNew] = useState(false)

  const commit = async () => {
    const sha = await onCommit(message.trim() === '' ? 'Checkpoint' : message.trim())
    if (sha === null) setNothingNew(true)
    else onClose()
  }

  return (
    <Dialog label="Commit a checkpoint">
      <p className="py-2">A checkpoint is a historical backup of your work.</p>
      <label>
        Message
        <input
          aria-label="Message"
          value={message}
          autoFocus
          onChange={(e) => {
            setMessage(e.target.value)
            setNothingNew(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
          }}
        />
      </label>
      {nothingNew && <p className="hist-empty">Nothing new since the last commit.</p>}
      <div className="create-actions">
        <button type="button" onClick={() => void commit()}>
          Commit checkpoint
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  )
}
