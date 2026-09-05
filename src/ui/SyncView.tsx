import { useState } from 'react'
import type { GitHubSpot } from '../git/github'
import { Dialog } from './CreateDialog'

/** What story.json carries about the remote — never the token. */
export interface SyncSettings {
  owner: string
  repo: string
}

/**
 * The Sync view: which GitHub repository this story mirrors to, and how
 * the last sync went. The token is pasted once and stays in this
 * browser's storage; the story folder never sees it.
 */
export function SyncView({
  settings,
  token,
  status,
  onSave,
}: {
  settings: SyncSettings | null
  token: string
  status: string | null
  onSave: (spot: GitHubSpot) => void
}) {
  const [owner, setOwner] = useState(settings?.owner ?? '')
  const [repo, setRepo] = useState(settings?.repo ?? '')
  const [pat, setPat] = useState(token)

  const ready = owner.trim() !== '' && repo.trim() !== '' && pat.trim() !== ''

  return (
    <section className="hist-wrap" role="region" aria-label="Sync">
      <div className="view-bar">
        <h2>Sync</h2>
        <span className="view-sub">your own GitHub repository — every commit pushes, pull comes first, never a force</span>
      </div>
      <div className="sync-form">
        <label>
          Owner
          <input aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="your GitHub user" />
        </label>
        <label>
          Repository
          <input aria-label="Repository" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="the repo this story lives in" />
        </label>
        <label>
          Token
          <input aria-label="Token" type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="fine-grained personal access token" />
        </label>
        <button disabled={!ready} onClick={() => onSave({ owner: owner.trim(), repo: repo.trim(), token: pat.trim() })}>
          Save &amp; sync
        </button>
      </div>
      {status && <p className="sync-status">{status}</p>}
      <p className="start-note">
        A fine-grained personal access token with read and write on Contents, for that one repository, is
        enough. It stays in this browser — the story folder and its commits never contain it.
      </p>
    </section>
  )
}

/** Joining from another machine: name the repository, and the whole story comes down. */
export function PullDialog({
  onPull,
  onCancel,
}: {
  onPull: (spot: GitHubSpot) => void
  onCancel: () => void
}) {
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [pat, setPat] = useState('')
  const ready = owner.trim() !== '' && repo.trim() !== '' && pat.trim() !== ''

  return (
    <Dialog label="Pull from GitHub">
      <p>The whole story comes down into the picked folder — files and history both.</p>
      <label>
        Owner
        <input aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
      </label>
      <label>
        Repository
        <input aria-label="Repository" value={repo} onChange={(e) => setRepo(e.target.value)} />
      </label>
      <label>
        Token
        <input aria-label="Token" type="password" value={pat} onChange={(e) => setPat(e.target.value)} />
      </label>
      <div className="create-actions">
        <button disabled={!ready} onClick={() => onPull({ owner: owner.trim(), repo: repo.trim(), token: pat.trim() })}>
          Pull story
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  )
}
