import { useEffect, useState } from 'react'
import type { ProcessRunner, RunnerStatus } from '../adapters/types'
import type { Story } from '../domain/types'
import { pingRequest, run } from '../assistant/runner'

/**
 * The coach: where the model-backed work reports. The Model section says
 * whether the writer's own Claude Code can be reached and lets them prove
 * it with a ping; the reads and continuity checks arrive with the later
 * steps of issue 17.
 */
export function CoachView({ story, runner }: { story: Story; runner?: ProcessRunner }) {
  const [status, setStatus] = useState<RunnerStatus | null>(null)
  const [ping, setPing] = useState<{ kind: 'idle' } | { kind: 'running' } | { kind: 'ok'; echo: string } | { kind: 'failed'; reason: string }>({ kind: 'idle' })

  useEffect(() => {
    if (!runner) return
    let live = true
    void runner.status().then((next) => {
      if (live) setStatus(next)
    })
    return () => {
      live = false
    }
  }, [runner])

  const test = async () => {
    if (!runner) return
    setPing({ kind: 'running' })
    try {
      const result = await run<{ echo: string }>(runner, pingRequest(story.manifest.title))
      setPing({ kind: 'ok', echo: result.output.echo })
    } catch (error) {
      setPing({ kind: 'failed', reason: (error as Error).message })
    }
  }

  const line = !runner
    ? 'This build has no way to reach Claude Code.'
    : status === null
      ? 'Checking for Claude Code…'
      : status.kind === 'ready'
        ? status.detail
        : status.reason

  return (
    <section className="hist-wrap" role="region" aria-label="Coach">
      <div className="view-bar">
        <h2>Coach</h2>
        <span className="view-sub">reads your scenes through your own Claude Code and reports back — never writes a word</span>
      </div>
      <div className="coach-section">
        <h3>Model</h3>
        <p className="coach-status" aria-live="polite">
          {line}
        </p>
        <p className="view-note">A run sends its briefing to Claude through the Claude Code you are signed into. Nothing else leaves the machine.</p>
        <div className="create-actions">
          <button type="button" disabled={!runner || status?.kind !== 'ready' || ping.kind === 'running'} onClick={() => void test()}>
            {ping.kind === 'running' ? 'Testing…' : 'Test'}
          </button>
          {ping.kind === 'ok' && <span className="coach-echo">Claude answered: “{ping.echo}”</span>}
          {ping.kind === 'failed' && (
            <span className="coach-echo" role="alert">
              {ping.reason}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
