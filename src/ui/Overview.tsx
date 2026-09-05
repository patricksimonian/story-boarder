import { Fragment } from 'react'
import { sceneAct } from '../board/layout'
import type { Act, Slug, Story } from '../domain/types'
import { Glyph, SceneBadges } from './SceneBadges'
import { openSceneProps } from './sceneCard'

/** Zoomed out: the compact acts-by-storylines grid, title-only cards. */
export function Overview({
  story,
  onZoomAct,
  onOpenScene,
}: {
  story: Story
  onZoomAct: (act: Slug) => void
  onOpenScene: (scene: Slug) => void
}) {
  const { manifest, scenes } = story
  const actOf = (id: Slug) => {
    const scene = scenes.get(id)
    return scene ? sceneAct(scene, manifest) : undefined
  }
  // Lane scenes with no act yet get a leading column of their own, as on the board.
  const hasUnassigned = manifest.storylines.some((lane) => lane.scenes.some((id) => actOf(id) === null))
  const columns: (Act | null)[] = hasUnassigned ? [null, ...manifest.acts] : manifest.acts
  return (
    <div className="ov-wrap">
      <div
        className="ov-board"
        style={{ gridTemplateColumns: `120px repeat(${columns.length}, minmax(215px, 1fr))` }}
      >
        <div />
        {columns.map((act) =>
          act ? (
            <button
              key={act.id}
              className="ov-acthead"
              aria-label={`Open ${act.title}`}
              onClick={() => onZoomAct(act.id)}
            >
              <span>{act.title}</span>
              <span className="zoom">⤢</span>
            </button>
          ) : (
            <div key="none" className="ov-acthead ov-noact" title="Scenes in a storyline that have no act yet">
              <span>No act yet</span>
            </div>
          ),
        )}
        {manifest.storylines.map((lane) => (
          <Fragment key={lane.id}>
            <div className="ov-lane">
              <Glyph color={lane.color} glyph={lane.glyph} /> <span>{lane.name}</span>
            </div>
            {columns.map((act) => (
              <div key={`${lane.id}-${act?.id ?? 'none'}`} className="ov-cell" style={{ background: `${lane.color}12` }}>
                {lane.scenes
                  .filter((id) => actOf(id) === (act?.id ?? null))
                  .map((id) => scenes.get(id))
                  .map((scene) => {
                    if (!scene) return null
                    const primary = scene.storylines[0] === lane.id
                    const home = story.manifest.storylines.find((s) => s.id === scene.storylines[0])
                    return primary || !home ? (
                      <div
                        key={scene.id}
                        className="ov-card"
                        style={{ borderTopColor: lane.color }}
                        {...openSceneProps(scene, onOpenScene)}
                      >
                        <h4>{scene.title}</h4>
                        <SceneBadges scene={scene} compact />
                      </div>
                    ) : (
                      <div
                        key={scene.id}
                        className="ov-card ghost"
                        style={{ borderColor: lane.color }}
                        {...openSceneProps(scene, onOpenScene)}
                      >
                        <h4>{scene.title}</h4>
                        <div className="note">
                          ↳ shared from <Glyph color={home.color} glyph={home.glyph} /> {home.name}
                        </div>
                      </div>
                    )
                  })}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
