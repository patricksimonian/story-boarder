import { useEffect, useState } from 'react'

/**
 * The Read button and what stands beside it while a read runs: how long
 * it has been going, and a Cancel. A read that is stopped by its timeout
 * says so in the same place a failed one would.
 */
export function ReadButton({
  what,
  canRead,
  reading,
  readProblem,
  onRead,
  onCancel,
  className = 'ed-histbtn',
}: {
  /** "scene", "note", "page" — for the button's title. */
  what: string
  canRead: boolean
  reading: boolean
  readProblem: string | null
  onRead: () => void
  onCancel?: () => void
  className?: string
}) {
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!canRead || reading}
        title={`Sends this ${what} to Claude through your own Claude Code and records what it says about who is in it, what changes, and what the story still lacks`}
        onClick={onRead}
      >
        {reading ? 'Reading…' : 'Read'}
      </button>
      {reading && (
        <span className="read-progress" role="status" aria-label="Reading">
          <Elapsed />
          {onCancel && (
            <button type="button" className="goto" onClick={onCancel}>
              Cancel
            </button>
          )}
        </span>
      )}
      {readProblem && !reading && (
        <span className="ed-readnote" role="alert">
          {readProblem}
        </span>
      )}
    </>
  )
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="read-elapsed">{seconds}s</span>
}
