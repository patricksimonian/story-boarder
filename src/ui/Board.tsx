import { useEffect, useMemo, useState } from 'react'
import { dropPlacement, type Dragging } from '../board/drop'
import { laneIndexes, layoutBoard } from '../board/layout'
import type { Slug, Story } from '../domain/types'
import type { Placement } from '../story/mutations'
import { Glyph, SceneBadges } from './SceneBadges'
import { openSceneProps } from './sceneCard'

const COL_WIDTH = 150
const COL_GAP = 10
const PITCH = COL_WIDTH + COL_GAP
const LANE_HEIGHT = 104

/** Where a drag is hovering: the lane, the act (null in the no-act range), and the column boundary the scene would slot into. */
interface Hover {
  lane: Slug
  act: Slug | null
  /** Fractional board column under the pointer. */
  position: number
}

/** A stable key for an act range — the no-act range has no id of its own. */
const rangeKey = (act: { id: Slug } | null) => act?.id ?? 'none'

/**
 * The Storylines home view: subway-style lanes, scenes as compact nodes,
 * act boundaries as labeled dashed rules. A shared scene renders a full,
 * equal card in every member lane, joined by a connector line running
 * card to card. Cards drag: within a lane to reorder, across lanes to
 * move a membership (Ctrl adds one instead), across acts to re-time.
 */
export function Board({
  story,
  dragging,
  onZoomAct,
  onEditAct,
  onEditStoryline,
  onOpenScene,
  onDragStart,
  onDragEnd,
  onPlace,
  scrollerRef,
}: {
  story: Story
  dragging: Dragging | null
  onZoomAct: (act: Slug) => void
  onEditAct: (act: Slug) => void
  onEditStoryline: (storyline: Slug) => void
  onOpenScene: (scene: Slug) => void
  onDragStart: (dragging: Dragging) => void
  onDragEnd: () => void
  onPlace: (scene: Slug, placement: Placement) => void
  scrollerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { manifest, scenes } = story
  const layout = useMemo(() => layoutBoard(manifest, scenes), [manifest, scenes])
  const [hover, setHover] = useState<Hover | null>(null)

  const gridStyle = {
    gridTemplateColumns: `150px repeat(${layout.columnCount}, ${COL_WIDTH}px)`,
    gridTemplateRows: `34px repeat(${manifest.storylines.length}, ${LANE_HEIGHT}px)`,
  }

  // The wheel over the lanes is left alone: it scrolls the page down
  // through the storylines. Sideways travel belongs to the minimap, the
  // ←/→ keys, and shift+wheel.

  // Once the board has scrolled, the label column casts a shadow over
  // the cards passing under it, so the scroll position is visible.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const mark = () => {
      if (el.scrollLeft > 0) el.setAttribute('data-scrolled', '')
      else el.removeAttribute('data-scrolled')
    }
    mark()
    el.addEventListener('scroll', mark, { passive: true })
    return () => el.removeEventListener('scroll', mark)
  }, [scrollerRef])

  /** Fractional column under the pointer, for a zone starting at `start`. */
  const positionIn = (e: React.DragEvent<HTMLElement>, start: number) =>
    start + (e.clientX - e.currentTarget.getBoundingClientRect().left) / PITCH

  const dropOn = (e: React.DragEvent<HTMLElement>, lane: Slug, act: Slug | null, start: number) => {
    e.preventDefault()
    setHover(null)
    const scene = dragging && scenes.get(dragging.scene)
    if (!dragging || !scene) return
    const target = { lane, act, position: positionIn(e, start) }
    onPlace(scene.id, dropPlacement(scene, dragging, target, manifest, layout, e.ctrlKey))
  }

  /** The insertion line: at the left edge of the first card past the pointer, or after the last. */
  const dropLine = (() => {
    if (!hover || !dragging) return null
    const range = layout.actRanges.find((r) => (r.act?.id ?? null) === hover.act)
    const laneIndex = manifest.storylines.findIndex((s) => s.id === hover.lane)
    if (!range || laneIndex < 0) return null
    const lane = manifest.storylines[laneIndex]
    const inAct = lane.scenes
      .filter((id) => id !== dragging.scene && (layout.actOf.get(id) ?? null) === hover.act)
      .map((id) => layout.columns.get(id) as number)
      .sort((a, b) => a - b)
    const next = inAct.find((c) => c + 0.5 > hover.position)
    const column = next ?? (inAct.length ? inAct[inAct.length - 1] + 1 : Math.max(range.start, Math.floor(hover.position)))
    const before = Math.min(Math.max(column, range.start), range.end + 1)
    return { gridColumn: before + 2, gridRow: laneIndex + 2, atEnd: before > range.end }
  })()

  return (
    <div className="b-scroll" ref={scrollerRef}>
      <div className="b-grid" style={gridStyle}>
        <div className="b-lanemask" />
        {layout.actRanges.map(({ act, start, end }) => (
          <div key={`bg-${rangeKey(act)}`} className="b-actbg" style={{ gridColumn: `${start + 2} / ${end + 3}` }} />
        ))}
        {layout.actRanges.map(({ act, start, end }) => (
          // The cell spans the act's columns; the header inside sticks to the
          // label column's edge only while some of that span is in view.
          <div key={`hd-${rangeKey(act)}`} className="b-actcell" style={{ gridColumn: `${start + 2} / ${end + 3}` }}>
            <span className="b-actsticky">
              {act ? (
                <>
                  <button className="b-acthead" onClick={() => onZoomAct(act.id)} aria-label={`Open ${act.title}`} title={act.title}>
                    <span>{act.title}</span>
                    <span className="zoom">⤢</span>
                  </button>
                  <button
                    className="b-actpen"
                    aria-label={`Edit act ${act.title}`}
                    title="Edit act"
                    onClick={() => onEditAct(act.id)}
                  >
                    ✎
                  </button>
                </>
              ) : (
                // Scenes in a lane but not yet placed in time: nothing to open or edit.
                <span className="b-acthead b-noact" title="Scenes in a storyline that have no act yet">
                  No act yet
                </span>
              )}
            </span>
          </div>
        ))}
        {manifest.storylines.map((line, i) => (
          <div key={`lab-${line.id}`} className="b-lanelabel" data-storyline={line.id} style={{ gridRow: i + 2 }}>
            <button
              className="b-lanebtn"
              aria-label={`Edit storyline ${line.name}`}
              title="Edit storyline"
              onClick={() => onEditStoryline(line.id)}
            >
              <Glyph color={line.color} glyph={line.glyph} /> <span>{line.name}</span>
              <span className="b-lanepen">✎</span>
            </button>
          </div>
        ))}
        {manifest.storylines.map((line, i) => (
          <div
            key={`ln-${line.id}`}
            className="b-line"
            style={{ gridRow: i + 2, backgroundColor: line.color }}
          />
        ))}
        {/* One drop zone per lane × act, under the cards; invisible until a drag is over it. */}
        {manifest.storylines.map((line, i) =>
          layout.actRanges.map(({ act, start, end }) => {
            const actId = act?.id ?? null
            return (
              <div
                key={`dz-${line.id}-${rangeKey(act)}`}
                className={`b-dropzone ${dragging && hover?.lane === line.id && hover.act === actId ? 'over' : ''}`}
                data-testid={`drop-${line.id}-${rangeKey(act)}`}
                style={{ gridColumn: `${start + 2} / ${end + 3}`, gridRow: i + 2 }}
                onDragOver={(e) => {
                  if (!dragging) return
                  e.preventDefault()
                  if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'
                  setHover({ lane: line.id, act: actId, position: positionIn(e, start) })
                }}
                onDragLeave={() => setHover(null)}
                onDrop={(e) => dropOn(e, line.id, actId, start)}
              />
            )
          }),
        )}
        {dropLine && (
          <div
            className={`b-dropline ${dropLine.atEnd ? 'at-end' : ''}`}
            style={{ gridColumn: dropLine.atEnd ? dropLine.gridColumn - 1 : dropLine.gridColumn, gridRow: dropLine.gridRow }}
          />
        )}
        {[...layout.columns.keys()].map((id) => {
          const scene = scenes.get(id)
          if (!scene) return null
          const column = layout.columns.get(id) as number
          const lanes = laneIndexes(scene, manifest)
          const colors = lanes.map((i) => manifest.storylines[i].color)
          const bridge =
            lanes.length > 1 ? (
              <div
                className="b-link"
                style={{
                  gridColumn: column + 2,
                  gridRow: `${lanes[0] + 2} / ${lanes[lanes.length - 1] + 3}`,
                  background: `linear-gradient(${colors[0]}, ${colors[colors.length - 1]})`,
                }}
              />
            ) : null
          return (
            <span key={id} style={{ display: 'contents' }}>
              {bridge}
              {lanes.map((lane, k) => (
                <div
                  key={lane}
                  className={`b-node ${dragging?.scene === id ? 'dragging' : ''}`}
                  data-lane={manifest.storylines[lane].id}
                  style={{ gridColumn: column + 2, gridRow: lane + 2, borderLeftColor: colors[k] }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer?.setData('text/plain', id)
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'
                    onDragStart({ scene: id, fromLane: manifest.storylines[lane].id })
                  }}
                  onDragEnd={() => {
                    setHover(null)
                    onDragEnd()
                  }}
                  {...openSceneProps(scene, onOpenScene)}
                >
                  {lanes.length > 1 && (
                    <div className="b-glyphrow">
                      {lanes.map((l) => (
                        <Glyph
                          key={l}
                          color={manifest.storylines[l].color}
                          glyph={manifest.storylines[l].glyph}
                        />
                      ))}
                    </div>
                  )}
                  <h4>{scene.title}</h4>
                  <SceneBadges scene={scene} compact />
                </div>
              ))}
            </span>
          )
        })}
      </div>
    </div>
  )
}
