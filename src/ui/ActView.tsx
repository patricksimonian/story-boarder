import type { Scene, Slug, Story } from '../domain/types'
import { Glyph, SceneBadges } from './SceneBadges'
import { openSceneProps } from './sceneCard'

const short = (title: string) => title.split('—')[0].trim()

/** Zoomed in: one act, prose-forward cards grouped by storyline lane. */
export function ActView({
  story,
  actId,
  onView,
  onOpenScene,
}: {
  story: Story
  actId: Slug
  onView: (next: { level: 'storylines' } | { level: 'act'; act: Slug }) => void
  onOpenScene: (scene: Slug) => void
}) {
  const { manifest, scenes } = story
  const index = manifest.acts.findIndex((a) => a.id === actId)
  const act = manifest.acts[index]
  if (!act) return null
  const previous = manifest.acts[index - 1]
  const next = manifest.acts[index + 1]

  return (
    <div className="act-wrap">
      <div className="act-bar">
        <button className="crumb-btn" onClick={() => onView({ level: 'storylines' })}>
          ⌁ Storylines
        </button>
        <span className="crumb-sep">▸</span>
        <h2>{act.title}</h2>
        <span className="spacer" />
        <button
          className="nav"
          disabled={!previous}
          onClick={() => previous && onView({ level: 'act', act: previous.id })}
        >
          ‹ {previous ? short(previous.title) : 'prev'}
        </button>
        <button
          className="nav"
          disabled={!next}
          onClick={() => next && onView({ level: 'act', act: next.id })}
        >
          {next ? short(next.title) : 'next'} ›
        </button>
      </div>
      {manifest.storylines.map((lane) => {
        const laneScenes = lane.scenes
          .map((id) => scenes.get(id))
          .filter((scene): scene is Scene => scene?.act === actId)
        if (laneScenes.length === 0) return null
        return (
          <section key={lane.id} className="act-lane">
            <h4>
              <Glyph color={lane.color} glyph={lane.glyph} /> <span>{lane.name}</span>
            </h4>
            <div className="c-row">
              {laneScenes.map((scene) =>
                scene.storylines[0] === lane.id ? (
                  <ProseCard key={scene.id} scene={scene} story={story} onOpen={onOpenScene} />
                ) : (
                  <GhostCard key={scene.id} scene={scene} story={story} laneColor={lane.color} onOpen={onOpenScene} />
                ),
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ProseCard({ scene, story, onOpen }: { scene: Scene; story: Story; onOpen: (id: Slug) => void }) {
  const chips = scene.storylines
    .map((id) => story.manifest.storylines.find((s) => s.id === id))
    .filter((s) => s !== undefined)
  return (
    <div className="c-card" {...openSceneProps(scene, onOpen)}>
      <span className="stripes">
        {chips.map((line) => (
          <i key={line.id} style={{ background: line.color }} />
        ))}
      </span>
      <h4>{scene.title}</h4>
      {scene.synopsis && <div className="fullsyn">{scene.synopsis}</div>}
      {scene.beats.length > 0 && (
        <ul className="beats-preview">
          {scene.beats.slice(0, 2).map((beat, i) => (
            <li key={i}>{beat}</li>
          ))}
        </ul>
      )}
      <div className="slchips">
        {chips.map((line) => (
          <span key={line.id}>
            <Glyph color={line.color} glyph={line.glyph} /> {line.name}
          </span>
        ))}
      </div>
      <div className="badges-row">
        <SceneBadges scene={scene} />
        <span className="tags">
          {scene.tags.map((tag) => (
            <span key={tag} className="tag">
              #{tag}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

function GhostCard({
  scene,
  story,
  laneColor,
  onOpen,
}: {
  scene: Scene
  story: Story
  laneColor: string
  onOpen: (id: Slug) => void
}) {
  const home = story.manifest.storylines.find((s) => s.id === scene.storylines[0])
  return (
    <div className="c-card ghost" style={{ borderColor: laneColor }} {...openSceneProps(scene, onOpen)}>
      <h4>{scene.title}</h4>
      <div className="note">
        ↳ shared — full card in {home && <Glyph color={home.color} glyph={home.glyph} />} {home?.name}
      </div>
    </div>
  )
}
