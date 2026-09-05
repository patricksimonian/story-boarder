import type { Act, Scene, Slug, StoryManifest } from '../domain/types'

/**
 * Column allocation for the Storylines board and its minimap: one shared
 * timeline of columns, grouped by act. Within an act, columns follow
 * manifest storyline order, then each storyline's scene order; a scene
 * appears at one column no matter how many lanes it sits in.
 *
 * Lane scenes that have no act yet — the field unset, or naming an act
 * story.json doesn't declare — come first, in a range of their own with
 * `act: null`. That matches the seating rule in placeScene, which ranks
 * "no act" before the first act, so lane order and column order agree.
 * The range exists only while it has scenes.
 */
export interface BoardLayout {
  /** Scene → 0-based column on the shared timeline. */
  columns: Map<Slug, number>
  /** Scene → the declared act whose columns it sits in; absent for scenes with no act. */
  actOf: Map<Slug, Slug>
  /**
   * Inclusive column range per act, in act order, after the no-act range
   * when there is one. Empty acts get one blank column.
   */
  actRanges: { act: Act | null; start: number; end: number }[]
  columnCount: number
}

/** The act a scene sits in, or null when it has none or names one the manifest doesn't declare. */
export function sceneAct(scene: Scene, manifest: StoryManifest): Slug | null {
  return scene.act !== undefined && manifest.acts.some((a) => a.id === scene.act) ? scene.act : null
}

export function layoutBoard(manifest: StoryManifest, scenes: Map<Slug, Scene>): BoardLayout {
  const columns = new Map<Slug, number>()
  const actOf = new Map<Slug, Slug>()
  const actRanges: BoardLayout['actRanges'] = []
  let next = 0

  /** Hands a column to every lane scene (in lane order) whose act is `act`. */
  const place = (act: Slug | null) => {
    for (const storyline of manifest.storylines) {
      for (const id of storyline.scenes) {
        if (columns.has(id)) continue
        const scene = scenes.get(id)
        if (!scene || sceneAct(scene, manifest) !== act) continue
        columns.set(id, next++)
        if (act !== null) actOf.set(id, act)
      }
    }
  }

  place(null)
  if (next > 0) actRanges.push({ act: null, start: 0, end: next - 1 })
  for (const act of manifest.acts) {
    const start = next
    place(act.id)
    if (next === start) next++
    actRanges.push({ act, start, end: next - 1 })
  }
  return { columns, actOf, actRanges, columnCount: next }
}

/** The lanes a scene belongs to, as 0-based lane indexes in manifest order. */
export function laneIndexes(scene: Scene, manifest: StoryManifest): number[] {
  return scene.storylines
    .map((id) => manifest.storylines.findIndex((s) => s.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
}
