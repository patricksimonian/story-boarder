import type { Chance, ConditionSource, Scene, Slug, Story } from '../domain/types'
import { layoutBoard } from './layout'

/**
 * The graph view's layout, derived from the board: a scene's x follows
 * its board column and its y the first lane it sits in, so the graph
 * reads like the board with the choices drawn in. Pool scenes take a row
 * under the lanes; scenes a choice names but nobody has written take a
 * row under that. Nothing here is persisted — there's nothing to get
 * stale — and if free-form positions are ever wanted, `settings.graph`
 * in story.json is where they'd live.
 */
export interface GraphNode {
  id: string
  kind: 'scene' | 'missing'
  scene?: Scene
  /** For a missing node: the slug the choice named. */
  slug: Slug
  x: number
  y: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
  condition?: ConditionSource
  chance?: Chance
}

export const GRAPH_X = 240
export const GRAPH_Y = 140

export function layoutGraph(story: Story): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { manifest, scenes } = story
  const layout = layoutBoard(manifest, scenes)
  const nodes: GraphNode[] = []
  const laneRows = manifest.storylines.length

  const placed = [...scenes.values()].filter((s) => layout.columns.has(s.id))
  for (const scene of placed) {
    const column = layout.columns.get(scene.id) as number
    const lane = Math.max(0, manifest.storylines.findIndex((s) => scene.storylines.includes(s.id)))
    nodes.push({ id: scene.id, kind: 'scene', scene, slug: scene.id, x: column * GRAPH_X, y: lane * GRAPH_Y })
  }
  const unplaced = [...scenes.values()]
    .filter((s) => !layout.columns.has(s.id))
    .sort((a, b) => a.title.localeCompare(b.title))
  unplaced.forEach((scene, i) => {
    nodes.push({ id: scene.id, kind: 'scene', scene, slug: scene.id, x: i * GRAPH_X, y: (laneRows + 0.5) * GRAPH_Y })
  })

  const edges: GraphEdge[] = []
  const missing = new Map<Slug, GraphNode>()
  for (const scene of scenes.values()) {
    scene.choices.forEach((choice, i) => {
      let target = choice.to
      if (!scenes.has(choice.to)) {
        target = `missing:${choice.to}`
        if (!missing.has(choice.to)) {
          missing.set(choice.to, {
            id: target,
            kind: 'missing',
            slug: choice.to,
            x: missing.size * GRAPH_X,
            y: (laneRows + 1.5) * GRAPH_Y,
          })
        }
      }
      edges.push({
        id: `${scene.id}:${i}`,
        source: scene.id,
        target,
        label: choice.label,
        condition: choice.condition,
        chance: choice.chance,
      })
    })
  }
  nodes.push(...missing.values())
  return { nodes, edges }
}
