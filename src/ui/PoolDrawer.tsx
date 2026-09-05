import { useState } from 'react'
import type { Dragging } from '../board/drop'
import type { Scene, Slug } from '../domain/types'
import { SceneBadges } from './SceneBadges'
import { openSceneProps } from './sceneCard'

/**
 * The idea pool: a right-hand drawer, identical in every view. Its cards
 * drag out onto the board, and a card dragged in from a lane goes loose.
 */
export function PoolDrawer({
  scenes,
  dragging,
  onOpenScene,
  onDragStart,
  onDragEnd,
  onDropToPool,
}: {
  scenes: Scene[]
  dragging: Dragging | null
  onOpenScene: (id: Slug) => void
  onDragStart: (dragging: Dragging) => void
  onDragEnd: () => void
  onDropToPool: (scene: Slug) => void
}) {
  const [over, setOver] = useState(false)
  // Only a card that came from a lane has anywhere to go here.
  const accepts = dragging !== null && dragging.fromLane !== undefined
  return (
    <aside
      className={`pool-drawer ${accepts && over ? 'over' : ''}`}
      aria-label="Idea pool"
      onDragOver={(e) => {
        if (!accepts) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        if (!accepts || !dragging) return
        e.preventDefault()
        onDropToPool(dragging.scene)
      }}
    >
      <div className="pool-head">Idea pool — unplaced scenes</div>
      {accepts && <p className="pool-hint">Drop here to take it out of every storyline.</p>}
      {scenes.length === 0 && !accepts && <p className="pool-empty">Nothing loose right now.</p>}
      {scenes.map((scene) => (
        <div
          key={scene.id}
          className="pool-card"
          draggable
          onDragStart={(e) => {
            e.dataTransfer?.setData('text/plain', scene.id)
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
            onDragStart({ scene: scene.id })
          }}
          onDragEnd={onDragEnd}
          {...openSceneProps(scene, onOpenScene)}
        >
          <h4>{scene.title}</h4>
          {scene.synopsis && <div className="syn">{scene.synopsis}</div>}
          <SceneBadges scene={scene} />
          {scene.tags.length > 0 && (
            <div className="badges">
              {scene.tags.map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </aside>
  )
}
