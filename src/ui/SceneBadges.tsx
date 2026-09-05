import type { Scene } from '../domain/types'

/**
 * The engine badges every scene card carries: ⚑ condition, Δ effects,
 * ◔ chance, ⑂ choices, ≡ beats — sized by the card's zoom level via CSS.
 */
export function SceneBadges({ scene, compact }: { scene: Scene; compact?: boolean }) {
  return (
    <div className="badges">
      {scene.condition !== undefined && (
        <span className="bdg cond" title={scene.condition}>
          ⚑{compact ? '' : ` ${scene.condition}`}
        </span>
      )}
      {scene.chance !== undefined && <span className="bdg">◔ {scene.chance}%</span>}
      {scene.choices.length > 0 && (
        <span className="bdg" title={`${scene.choices.length} choice(s)`}>
          ⑂ {scene.choices.length}
        </span>
      )}
      {scene.beats.length > 0 && <span className="bdg">≡ {scene.beats.length}</span>}
      {scene.effects.length > 0 && (
        <span className="bdg" title={scene.effects.map((e) => e.source).join(', ')}>
          Δ {scene.effects.length}
        </span>
      )}
    </div>
  )
}

export function Glyph({ color, glyph }: { color: string; glyph: string }) {
  return (
    <span className="glyph" style={{ color }}>
      {glyph}
    </span>
  )
}
