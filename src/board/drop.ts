import type { Scene, Slug, StoryManifest } from '../domain/types'
import type { Placement } from '../story/mutations'
import type { BoardLayout } from './layout'

/** What's being dragged: a scene, and the lane its card came from (none from the pool). */
export interface Dragging {
  scene: Slug
  fromLane?: Slug
}

/** Where it was dropped: a lane, an act (null for the no-act range), and a fractional column along the board. */
export interface DropTarget {
  lane: Slug
  act: Slug | null
  /** Position in board columns — 2.5 is the centre of column 2. */
  position: number
}

/**
 * Turns a drop on the board into a placement. The scene lands in the
 * target lane's order just before the first scene there whose centre
 * lies past the drop position (within the target act; earlier acts come
 * before, later acts after). Dragged from another lane, the membership
 * moves; with `copy` (Ctrl held) it's added instead, so a scene can be
 * shared by dragging. Dragged from the pool, the scene joins the lane.
 */
export function dropPlacement(
  scene: Scene,
  dragging: Dragging,
  target: DropTarget,
  manifest: StoryManifest,
  layout: BoardLayout,
  copy: boolean,
): Placement {
  const storylines = nextMemberships(scene.storylines, dragging.fromLane, target.lane, copy)
  const lane = manifest.storylines.find((s) => s.id === target.lane)
  const rank = new Map(manifest.acts.map((a, i) => [a.id, i]))
  const targetRank = target.act === null ? -1 : (rank.get(target.act) ?? -1)
  const rest = (lane?.scenes ?? []).filter((id) => id !== scene.id)
  let index = rest.findIndex((id) => {
    const column = layout.columns.get(id)
    const actRank = rank.get(layout.actOf.get(id) ?? '') ?? -1
    if (actRank !== targetRank) return actRank > targetRank
    return column !== undefined && column + 0.5 > target.position
  })
  if (index < 0) index = rest.length
  return { storylines, act: target.act ?? undefined, at: { storyline: target.lane, index } }
}

function nextMemberships(current: Slug[], fromLane: Slug | undefined, toLane: Slug, copy: boolean): Slug[] {
  if (current.includes(toLane)) {
    return fromLane === undefined || copy || fromLane === toLane ? current : current.filter((s) => s !== fromLane)
  }
  if (fromLane === undefined || copy) return [...current, toLane]
  return current.map((s) => (s === fromLane ? toLane : s))
}
