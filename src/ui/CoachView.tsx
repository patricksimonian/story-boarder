import type { Slug, Story, TargetKey } from '../domain/types'
import { developmentLog, storyOrder, type Ledger } from '../assistant/ledger'
import { targetKey } from '../mentions/verdicts'
import type { View } from '../state/view'

/**
 * The coach: where the model-backed work reports. Developments is the
 * log the scene reads keep — what each scene says about each named
 * thing, in story order — and the place to read the whole story in one
 * pass; Continuity checks a storyline through that log. The switch, the
 * model, and the prompts live in Settings.
 */
export function CoachView({
  story,
  coachingOn = false,
  onView = () => { },
  ledger = {},
  titleOf = () => undefined,
  onOpenScene = () => { },
  onReadAll = () => { },
  onCancelReadAll = () => { },
  readingAll = null,
  readProblem = null,
  continuityCount = 0,
  onCheck = () => { },
  onCheckAll = () => { },
  onCancelCheck = () => { },
  checking = null,
}: {
  story: Story
  /** The switch is on and the health check passed. */
  coachingOn?: boolean
  onView?: (view: View) => void
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
}) {
  const ready = coachingOn
  const log = developmentLog(ledger, story, titleOf)
  const noted = storyOrder(story)
    .map((item) => ({ item, notes: ledger[targetKey(item)]?.notes ?? [] }))
    .filter((row) => row.notes.length > 0)

  return (
    <section className="hist-wrap" role="region" aria-label="Coach">
      <div className="view-bar">
        <h2>Coach</h2>
        <span className="view-sub">reads your scenes through your own Claude Code and reports back — never writes a word</span>
      </div>
      {!coachingOn && (
        <p className="coach-off" role="status">
          Coaching is off.{' '}
          <button type="button" className="goto" onClick={() => onView({ level: 'settings' })}>
            Turn it on in Settings ↗
          </button>
        </p>
      )}
      <div className="coach-section">
        <h3>Editor’s notes</h3>
        {noted.length === 0 ? (
          <p className="hist-empty">No notes yet.</p>
        ) : (
          <div className="coach-log">
            {noted.map(({ item, notes }) => (
              <div key={targetKey(item)} className="coach-entity">
                <h4>
                  {item.title}{' '}

                  {item.kind === 'scene' && (
                    <button type="button" className="goto" aria-label={`Open scene ${item.title}`} onClick={() => onOpenScene(item.id)}>
                      ↗
                    </button>
                  )}
                </h4>
                <ul>
                  {notes.map((note, i) => (
                    <li key={i}>
                      <span className="coach-kind">{note.kind}</span>{' '}
                      <span className="coach-fact" title={note.quote}>
                        {note.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
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
