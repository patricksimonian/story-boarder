import type { ContinuityFinding } from '../assistant/continuity'
import type { Slug, Story } from '../domain/types'
import type { Finding, Severity } from '../engine/analyse'

const LABEL: Record<Severity, string> = { error: 'Errors', warning: 'Warnings', note: 'Notes' }
const BLURB: Record<Severity, string> = {
  error: 'Expressions that don’t read or name things that don’t exist.',
  warning: 'Gates nothing can ever open — a branch or a scene the player will never see.',
  note: 'Variables declared but never set, or set but never read.',
}

/**
 * What the story promises that it can’t keep, grouped by how much it
 * matters — and, once a continuity check has run, what the scenes say
 * that cannot all be true, each end quoted and linked.
 */
export function AnalysisView({
  story,
  findings,
  continuity = [],
  onDismissContinuity = () => {},
  onOpenScene,
}: {
  story: Story
  findings: Finding[]
  /** Pending from the last continuity check; dismissed one by one, gone when the story is left. */
  continuity?: ContinuityFinding[]
  onDismissContinuity?: (id: string) => void
  onOpenScene: (id: Slug) => void
}) {
  const groups = (['error', 'warning', 'note'] as Severity[]).map((severity) => ({
    severity,
    items: findings.filter((f) => f.severity === severity),
  }))
  const total = findings.length + continuity.length
  return (
    <section className="an-wrap" role="region" aria-label="Analysis">
      <div className="view-bar">
        <h2>Analysis</h2>
        <span className="view-sub">
          {total === 0 ? 'Nothing to report — every gate can open and every reference resolves.' : `${total} ${total === 1 ? 'finding' : 'findings'}, checked against the story as it is now.`}
        </span>
      </div>
      {continuity.length > 0 && (
        <div className="an-group warning">
          <h3>
            Continuity <span className="an-count">{continuity.length}</span>
          </h3>
          <p className="view-note">What the scenes say that cannot all be true along one storyline, as the last check read them.</p>
          <ul>
            {continuity.map((f) => (
              <li key={f.id}>
                <span className="an-message">{f.message}</span>
                {f.evidence.map((e, i) => {
                  const scene = story.scenes.get(e.scene)
                  return (
                    scene && (
                      <button key={i} type="button" className="goto" aria-label={`Open scene ${scene.title}`} title={e.quote} onClick={() => onOpenScene(scene.id)}>
                        {scene.title} ↗
                      </button>
                    )
                  )
                })}
                <button type="button" className="an-dismiss" aria-label={`Dismiss: ${f.message}`} onClick={() => onDismissContinuity(f.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.map(
        ({ severity, items }) =>
          items.length > 0 && (
            <div key={severity} className={`an-group ${severity}`}>
              <h3>
                {LABEL[severity]} <span className="an-count">{items.length}</span>
              </h3>
              <p className="view-note">{BLURB[severity]}</p>
              <ul>
                {items.map((f, i) => {
                  const scene = f.scene === undefined ? undefined : story.scenes.get(f.scene)
                  return (
                    <li key={i}>
                      <span className="an-message">{f.message}</span>
                      {scene && (
                        <button type="button" className="goto" aria-label={`Open scene ${scene.title}`} onClick={() => onOpenScene(scene.id)}>
                          {scene.title} ↗
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ),
      )}
    </section>
  )
}
