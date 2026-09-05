import type { Slug, Story } from '../domain/types'
import type { Finding, Severity } from '../engine/analyse'

const LABEL: Record<Severity, string> = { error: 'Errors', warning: 'Warnings', note: 'Notes' }
const BLURB: Record<Severity, string> = {
  error: 'Expressions that don’t read or name things that don’t exist.',
  warning: 'Gates nothing can ever open — a branch or a scene the player will never see.',
  note: 'Variables declared but never set, or set but never read.',
}

/** What the story promises that it can’t keep, grouped by how much it matters. */
export function AnalysisView({
  story,
  findings,
  onOpenScene,
}: {
  story: Story
  findings: Finding[]
  onOpenScene: (id: Slug) => void
}) {
  const groups = (['error', 'warning', 'note'] as Severity[]).map((severity) => ({
    severity,
    items: findings.filter((f) => f.severity === severity),
  }))
  return (
    <section className="an-wrap" role="region" aria-label="Analysis">
      <div className="view-bar">
        <h2>Analysis</h2>
        <span className="view-sub">
          {findings.length === 0 ? 'Nothing to report — every gate can open and every reference resolves.' : `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}, checked against the story as it is now.`}
        </span>
      </div>
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
