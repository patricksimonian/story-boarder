import { useEffect, useState } from 'react'
import { phaseWord, type Progress } from '../assistant/claudeCode'

/**
 * The Read button and what stands beside it while a read runs: how long
 * it has been going, and a Cancel. A read that is stopped by its timeout
 * says so in the same place a failed one would.
 */
export function ReadButton({
  what,
  canRead,
  reading,
  progress,
  readProblem,
  onRead,
  onCancel,
  className = 'ed-histbtn',
}: {
  /** "scene", "note", "page" — for the button's title. */
  what: string
  canRead: boolean
  reading: boolean
  /** What Claude Code is doing and since when; absent while nothing runs. */
  progress?: (Progress & { startedAt: number }) | undefined
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
        title={
          canRead
            ? `Sends this ${what} to Claude through your own Claude Code and records what it says about who is in it, what changes, and what the story still lacks`
            : 'Coaching is off, or its check has not passed — see Settings'
        }
        onClick={onRead}
      >
        {reading ? 'Reading…' : 'Read'}
      </button>
      {!canRead && !reading && <span className="read-off">coaching off — see Settings</span>}
      {reading && (
        <span className="read-progress" role="status" aria-label="Reading">
          {progress && <span className="read-phase">{phaseWord(progress)}</span>}
          <Elapsed since={progress?.startedAt} quietAfter={progress?.phase === 'starting' ? 20 : undefined} />
          {progress && progress.chars > 0 && <span className="read-chars">{progress.chars.toLocaleString()} chars</span>}
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

/** Seconds since the read began — the app's start time, so leaving the page and coming back does not restart the count. */
function Elapsed({ since, quietAfter }: { since?: number; quietAfter?: number }) {
  const [fallback] = useState(() => Date.now())
  const started = since ?? fallback
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - started) / 1000)))
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [started])
  return (
    <>
      <span className="read-elapsed">{seconds}s</span>
      {quietAfter !== undefined && seconds > quietAfter && (
        <span className="read-hint">no word from Claude Code yet — is the helper current? Settings checks it</span>
      )}
    </>
  )
}
