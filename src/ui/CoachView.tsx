import { useEffect, useState } from 'react'
import type { ProcessRunner, RunnerStatus } from '../adapters/types'
import type { Slug, Story, TargetKey } from '../domain/types'
import { developmentLog, type Ledger } from '../assistant/ledger'
import { pingRequest, run } from '../assistant/runner'
import type { View } from '../state/view'

/**
 * The coach: where the model-backed work reports. The Model section says
 * whether the writer's own Claude Code can be reached and lets them prove
 * it with a ping. Developments is the log the scene reads keep — what
 * each scene says about each named thing, in story order — and the
 * place to read the whole story in one pass.
 */
export function CoachView({
  story,
  runner,
  ledger = {},
  titleOf = () => undefined,
  onOpenScene = () => {},
  onReadAll = () => {},
  onCancelReadAll = () => {},
  readingAll = null,
  readProblem = null,
  continuityCount = 0,
  onCheck = () => {},
  onCheckAll = () => {},
  onCancelCheck = () => {},
  checking = null,
  onView = () => {},
}: {
  story: Story
  runner?: ProcessRunner
  ledger?: Ledger
  titleOf?: (key: TargetKey) => string | undefined
  onOpenScene?: (id: Slug) => void
  onReadAll?: () => void
  onCancelReadAll?: () => void
  readingAll?: { done: number; total: number } | null
  readProblem?: string | null
  /** How many continuity findings stand in the Analysis view. */
  continuityCount?: number
  onCheck?: (storyline: Slug) => void
  onCheckAll?: () => void
  onCancelCheck?: () => void
  checking?: { storyline: Slug; done: number; total: number } | null
  onView?: (view: View) => void
}) {
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

  const ready = !!runner && status?.kind === 'ready'
  const line = !runner
    ? 'This build has no way to reach Claude Code.'
    : status === null
      ? 'Checking for Claude Code…'
      : status.kind === 'ready'
        ? status.detail
        : status.reason
  const log = developmentLog(ledger, story, titleOf)

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
          <button type="button" disabled={!ready || ping.kind === 'running'} onClick={() => void test()}>
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
      <div className="coach-section">
        <h3>Developments</h3>
        <p className="view-note">
          What each scene says about each named thing, in story order, as the scene reads recorded it. A read follows a save, or the Read
          button on a scene; a scene that has not changed is never read twice.
        </p>
        <div className="create-actions">
          <button type="button" disabled={!ready || readingAll !== null} onClick={onReadAll}>
            {readingAll ? `Reading ${readingAll.done} of ${readingAll.total}…` : 'Read every changed scene'}
          </button>
          {readingAll && (
            <button type="button" onClick={onCancelReadAll}>
              Cancel
            </button>
          )}
          {readProblem && (
            <span className="coach-echo" role="alert">
              {readProblem}
            </span>
          )}
        </div>
        {log.length === 0 ? (
          <p className="hist-empty">Nothing read yet.</p>
        ) : (
          <div className="coach-log">
            {log.map((row) => (
              <div key={row.entity} className="coach-entity">
                <h4>{row.title}</h4>
                <ul>
                  {row.sites.map((site, i) => (
                    <li key={i}>
                      <span className="coach-fact" title={site.quote}>
                        {site.fact}
                      </span>
                      {site.item.kind === 'scene' ? (
                        <button type="button" className="goto" aria-label={`Open scene ${site.item.title}`} onClick={() => onOpenScene(site.item.id)}>
                          {site.item.title} ↗
                        </button>
                      ) : (
                        <span className="coach-where">{site.item.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="coach-section">
        <h3>Continuity</h3>
        <p className="view-note">
          A check walks one storyline through what its scenes developed, with the variable state the engine holds at each, and reports what
          cannot all be true. Findings land in Analysis. Read the scenes first; a check only sees what was read.
        </p>
        <div className="create-actions">
          <button type="button" disabled={!ready || checking !== null || story.manifest.storylines.length === 0} onClick={onCheckAll}>
            {checking ? `Checking ${checking.done + 1} of ${checking.total}…` : 'Check the whole story'}
          </button>
          {checking && (
            <button type="button" onClick={onCancelCheck}>
              Cancel
            </button>
          )}
          {continuityCount > 0 && (
            <button type="button" className="goto" onClick={() => onView({ level: 'analysis' })}>
              {continuityCount} {continuityCount === 1 ? 'finding' : 'findings'} in Analysis ↗
            </button>
          )}
        </div>
        <ul className="coach-lanes">
          {story.manifest.storylines.map((lane) => (
            <li key={lane.id}>
              <span className="glyph" style={{ color: lane.color }}>
                {lane.glyph}
              </span>{' '}
              {lane.name}
              <button type="button" className="goto" disabled={!ready || checking !== null} aria-label={`Check ${lane.name}`} onClick={() => onCheck(lane.id)}>
                {checking?.storyline === lane.id ? 'Checking…' : 'Check'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
