import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import { layoutGraph } from '../board/graph'
import type { Scene, Slug, Story } from '../domain/types'
import { Glyph, SceneBadges } from './SceneBadges'

type SceneNodeType = Node<{ scene: Scene; story: Story }, 'scene'>
type MissingNodeType = Node<{ slug: Slug }, 'missing'>

/**
 * The graph tab: scenes as nodes, choices as edges, conditions and
 * chance on the edges. It follows the board's idioms — glyphs, colors,
 * the same click-to-open — and its layout is derived from the board.
 */
export function GraphView({ story, onOpenScene }: { story: Story; onOpenScene: (id: Slug) => void }) {
  const { nodes, edges } = useMemo(() => {
    const graph = layoutGraph(story)
    const nodes: (SceneNodeType | MissingNodeType)[] = graph.nodes.map((n) =>
      n.kind === 'scene'
        ? {
            id: n.id,
            type: 'scene' as const,
            position: { x: n.x, y: n.y },
            data: { scene: n.scene as Scene, story },
            ariaRole: 'button',
            ariaLabel: `Open scene ${(n.scene as Scene).title}`,
          }
        : {
            id: n.id,
            type: 'missing' as const,
            position: { x: n.x, y: n.y },
            data: { slug: n.slug },
            ariaRole: 'note',
            ariaLabel: `Scene ${n.slug} not written`,
          },
    )
    const edges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: edgeLabel(e.label, e.condition, e.chance),
      labelStyle: { fontSize: 11, fill: '#4d463b' },
      labelBgStyle: { fill: '#fffdf9', fillOpacity: 0.9 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7d7568' },
      style: { stroke: e.target.startsWith('missing:') ? '#a33c2a' : '#7d7568', strokeWidth: 1.5 },
      className: e.target.startsWith('missing:') ? 'g-edge-missing' : undefined,
      ariaLabel: `Choice ${e.label}`,
    }))
    return { nodes, edges }
  }, [story])

  return (
    <div className="graph-wrap">
      <ReactFlow
        aria-label="Graph"
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === 'scene') onOpenScene(node.id)
        }}
      >
        <Background gap={24} color="#e0d9cb" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

/** The edge text: the choice's label, then its gate and its weight, each on its own line. */
function edgeLabel(label: string, condition?: string, chance?: number): React.ReactNode {
  if (condition === undefined && chance === undefined) return label
  return (
    <>
      <tspan x="0" dy="0">
        {label}
      </tspan>
      {condition !== undefined && (
        <tspan x="0" dy="1.3em" className="g-cond">
          ⚑ {condition}
        </tspan>
      )}
      {chance !== undefined && (
        <tspan x="0" dy="1.3em">
          ◔ {chance}%
        </tspan>
      )}
    </>
  )
}

function SceneNode({ data }: NodeProps<SceneNodeType>) {
  const { scene, story } = data
  const lanes = scene.storylines
    .map((id) => story.manifest.storylines.find((s) => s.id === id))
    .filter((s) => s !== undefined)
  return (
    <div className="g-node" style={{ borderLeftColor: lanes[0]?.color ?? 'var(--pool)' }}>
      <Handle type="target" position={Position.Left} className="g-handle" />
      {lanes.length > 0 ? (
        <div className="b-glyphrow">
          {lanes.map((line) => (
            <Glyph key={line.id} color={line.color} glyph={line.glyph} />
          ))}
        </div>
      ) : (
        <div className="g-pool">idea pool</div>
      )}
      <h4>{scene.title}</h4>
      <SceneBadges scene={scene} compact />
      <Handle type="source" position={Position.Right} className="g-handle" />
    </div>
  )
}

function MissingNode({ data }: NodeProps<MissingNodeType>) {
  return (
    <div className="g-node g-missing">
      <Handle type="target" position={Position.Left} className="g-handle" />
      <h4>
        <code>{data.slug}</code>
      </h4>
      <div className="g-pool">not written — a choice leads here</div>
    </div>
  )
}

const NODE_TYPES = { scene: SceneNode, missing: MissingNode }
