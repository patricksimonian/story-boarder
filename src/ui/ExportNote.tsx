import { useState } from 'react'
import type { OpenedFolder } from '../adapters/types'

/**
 * What the sidebar says after ⬇ Playable HTML: that it's working, why it
 * couldn't, or where the file went — the whole path when the platform
 * knows it, clickable when the platform can open it.
 */
export type ExportState = { kind: 'working' } | { kind: 'failed'; reason: string } | { kind: 'saved'; path: string }

export function ExportNote({ state, folder }: { state: ExportState; folder: OpenedFolder }) {
  const [problem, setProblem] = useState<string | null>(null)

  if (state.kind === 'working') {
    return (
      <div role="status" className="sb-note">
        Compiling the story…
      </div>
    )
  }
  if (state.kind === 'failed') {
    return (
      <div role="status" className="sb-note">
        {state.reason}
      </div>
    )
  }

  // The desktop knows the folder's real path; a browser only knows its name.
  const separator = folder.path?.includes('\\') ? '\\' : '/'
  const shown = folder.path
    ? `${folder.path}${separator}${state.path.split('/').join(separator)}`
    : `${folder.name}/${state.path}`
  const run = (action: (path: string) => Promise<void>) => {
    setProblem(null)
    action(state.path).catch((error: unknown) => setProblem((error as Error).message))
  }

  return (
    <div role="status" className="sb-note flex flex-col gap-1">
      <span>Saved the playable file.</span>
      {folder.open ? (
        <button
          type="button"
          title="Open it"
          onClick={() => run(folder.open!)}
          className="cursor-pointer break-all border-0 bg-transparent p-0 text-left font-mono text-[11px] text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {shown}
        </button>
      ) : (
        <span className="break-all font-mono text-[11px] text-ink">{shown}</span>
      )}
      {folder.reveal && (
        <button
          type="button"
          onClick={() => run(folder.reveal!)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          Show in folder
        </button>
      )}
      <span>It plays from anywhere, even file://</span>
      {problem && <span className="text-red-700">{problem}</span>}
    </div>
  )
}
