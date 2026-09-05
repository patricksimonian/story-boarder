import { useState } from 'react'
import type { Playthrough, Slug, Story, VariableState } from '../domain/types'
import { initialState } from '../engine/expr'
import { exits, hasEnded, replay, roll, startSimulation, suggestedStart, take, type Simulation } from '../engine/simulate'

/**
 * The simulator: walk the story from any scene, take choices, watch the
 * variables change, and keep the walk as a named playthrough — a test
 * case the story is checked against on replay.
 */
export function SimulateView({
  story,
  onOpenScene,
  onSavePlaythrough,
  onDeletePlaythrough,
}: {
  story: Story
  onOpenScene: (id: Slug) => void
  onSavePlaythrough: (playthrough: Playthrough) => void
  onDeletePlaythrough: (name: string) => void
}) {
  const [start, setStart] = useState<Slug | undefined>(() => suggestedStart(story))
  const [sim, setSim] = useState<Simulation | null>(() => {
    const first = suggestedStart(story)
    return first === undefined ? null : startSimulation(story, first)
  })
  const [name, setName] = useState('')
  const [verdict, setVerdict] = useState<string | null>(null)

  const restart = (at: Slug | undefined) => {
    setVerdict(null)
    setSim(at === undefined ? null : startSimulation(story, at))
  }

  const scenes = [...story.scenes.values()].sort((a, b) => a.title.localeCompare(b.title))
  const here = sim?.scene === undefined ? undefined : story.scenes.get(sim.scene)
  const list = sim ? exits(story, sim) : []
  const ended = sim ? hasEnded(story, sim) : true
  const initial = initialState(story.registry)

  const replayOne = (playthrough: Playthrough) => {
    const result = replay(story, playthrough)
    setSim(result.sim)
    setVerdict(
      result.broken
        ? `${playthrough.name} broke at step ${result.broken.step + 1}: ${result.broken.reason}`
        : `${playthrough.name} still holds — ${playthrough.steps.length} steps replayed to the same state.`,
    )
  }

  return (
    <section className="sim-wrap" role="region" aria-label="Simulator">
      <div className="view-bar">
        <h2>Simulate</h2>
        <label className="sim-start">
          Start at
          <select aria-label="Start at" value={start ?? ''} onChange={(e) => setStart(e.target.value || undefined)}>
            <option value="">— pick a scene —</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => restart(start)} disabled={start === undefined}>
          ↺ Restart
        </button>
      </div>
      {verdict && <p className={`sim-verdict ${verdict.includes('broke') ? 'broken' : ''}`}>{verdict}</p>}
      <div className="sim-cols">
        <div className="sim-main">
          {here ? (
            <div className="sim-scene">
              <h3>{here.title}</h3>
              {here.synopsis && <p className="sim-syn">{here.synopsis}</p>}
              {here.beats.length > 0 && (
                <ol className="sim-beats">
                  {here.beats.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ol>
              )}
              <button type="button" className="goto" onClick={() => onOpenScene(here.id)}>
                open in the editor
              </button>
            </div>
          ) : (
            <p className="view-note">{sim ? 'The walk has ended.' : 'Pick a scene to start from.'}</p>
          )}
          {sim && (
            <div className="sim-exits">
              <h4>{ended ? 'Nothing leads on from here.' : 'Ways on'}</h4>
              {list.map((exit, i) => (
                <div key={i} className={`sim-exit ${exit.kind}`}>
                  <button type="button" disabled={!exit.available} onClick={() => setSim(take(story, sim, exit))}>
                    {exit.kind === 'continue' && '→ '}
                    {exit.kind === 'storylet' && '✦ '}
                    {exit.label}
                    {exit.chance !== undefined && <span className="sim-chance"> ◔ {exit.chance}%</span>}
                  </button>
                  {exit.kind === 'storylet' && <span className="sim-kind">storylet</span>}
                  {!exit.available && <span className="sim-reason">{exit.reason}</span>}
                </div>
              ))}
              {!ended && list.filter((e) => e.available).length > 1 && (
                <button type="button" className="sim-roll" onClick={() => {
                  const picked = roll(story, sim)
                  if (picked) setSim(take(story, sim, picked))
                }}>
                  🎲 Roll
                </button>
              )}
            </div>
          )}
        </div>
        <div className="sim-side">
          <h4>Variables</h4>
          {sim && <StateTable state={sim.state} initial={initial} />}
          {sim && (
            <>
              <h4>Steps</h4>
              <ol className="sim-steps">
                {sim.steps.map((step, i) => (
                  <li key={i}>
                    {story.scenes.get(step.scene)?.title ?? step.scene}
                    {step.choice !== undefined && <span className="sim-via"> — {step.choice}</span>}
                  </li>
                ))}
              </ol>
              <div className="sim-save">
                <input aria-label="Playthrough name" placeholder="Name this walk" value={name} onChange={(e) => setName(e.target.value)} />
                <button
                  type="button"
                  disabled={name.trim() === ''}
                  onClick={() => {
                    onSavePlaythrough({ name: name.trim(), steps: sim.steps })
                    setName('')
                  }}
                >
                  Save playthrough
                </button>
              </div>
            </>
          )}
          <h4>Saved playthroughs</h4>
          {story.playthroughs.length === 0 && <p className="view-note">None yet. A saved walk replays against the story as it is now.</p>}
          <ul className="sim-saved">
            {story.playthroughs.map((p) => (
              <li key={p.name}>
                <button type="button" aria-label={`Replay ${p.name}`} onClick={() => replayOne(p)}>
                  ▶ {p.name}
                </button>
                <span className="sim-kind">{p.steps.length} steps</span>
                <button type="button" className="danger-link" aria-label={`Delete playthrough ${p.name}`} onClick={() => onDeletePlaythrough(p.name)}>
                  delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function StateTable({ state, initial }: { state: VariableState; initial: VariableState }) {
  const ids = Object.keys(initial)
  if (ids.length === 0) return <p className="view-note">No variables declared.</p>
  return (
    <table className="sim-state">
      <tbody>
        {ids.map((id) => (
          <tr key={id} className={state[id] !== initial[id] ? 'changed' : ''}>
            <td>{id}</td>
            <td>{String(state[id])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
