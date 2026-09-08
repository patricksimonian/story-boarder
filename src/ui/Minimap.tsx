import { useEffect, useMemo, useRef, useState } from 'react'
import { boardGeometry, columnAt, pixelOf } from '../board/geometry'
import { laneIndexes, layoutBoard } from '../board/layout'
import type { Story } from '../domain/types'
import { Glyph } from './SceneBadges'

/** Every board column, whatever its width there, is 24px here. */
const MM_PITCH = 24

const laneTop = (lane: number) => 4 + lane * 14
const short = (title: string) => title.split('—')[0].trim()

/**
 * The condensed navigator docked under the Storylines view: the whole
 * story at a fixed pitch, a live viewport rectangle, act labels as the
 * index, marks mirroring the board's cards and bridges.
 */
export function Minimap({
  story,
  scroller,
}: {
  story: Story
  scroller: React.RefObject<HTMLDivElement | null>
}) {
  const { manifest, scenes } = story
  const layout = useMemo(() => layoutBoard(manifest, scenes), [manifest, scenes])
  const geometry = useMemo(() => boardGeometry(layout), [layout])
  const trackRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ left: 0, width: 0 })
  const dragging = useRef(false)

  // A vertical wheel anywhere over the minimap drives the story sideways.
  // React registers wheel handlers as passive, so this is a native
  // listener: it has to cancel the event, or the page scrolls too.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      const el = scroller.current
      if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [scroller])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => {
      const from = columnAt(geometry, el.scrollLeft)
      const to = columnAt(geometry, el.scrollLeft + Math.min(el.clientWidth, el.scrollWidth))
      setViewport({ left: from * MM_PITCH, width: (to - from) * MM_PITCH })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [scroller, geometry])

  const scrollToClientX = (clientX: number) => {
    const el = scroller.current
    const track = trackRef.current
    if (!el || !track) return
    const rect = track.getBoundingClientRect()
    el.scrollTo({ left: pixelOf(geometry, (clientX - rect.left) / MM_PITCH) - el.clientWidth / 2 })
  }

  const width = layout.columnCount * MM_PITCH

  return (
    <div className="minimap" data-testid="minimap" ref={rootRef}>
      <div className="mm-legend">
        {manifest.storylines.map((line) => (
          <div key={line.id}>
            <Glyph color={line.color} glyph={line.glyph} /> {line.name}
          </div>
        ))}
      </div>
      <div className="mm-main">
        <div className="mm-acts" style={{ width }}>
          {/* The no-act range goes unlabeled: at 24px a column can't hold a word, and the
              dashed line before the first act already marks where the acts begin. */}
          {layout.actRanges.map(({ act, start, end }) => act && (
            // A label is confined to its act's columns — an empty act has one,
            // 24px — and shows an ellipsis rather than running into the next.
            <span
              key={act.id}
              title={act.title}
              style={{ left: start * MM_PITCH, maxWidth: (end - start + 1) * MM_PITCH - 4 }}
              onClick={() =>
                scroller.current?.scrollTo({
                  left: Math.max(0, pixelOf(geometry, start) - 34),
                  behavior: 'smooth',
                })
              }
            >
              {short(act.title)}
            </span>
          ))}
        </div>
        <div
          className="mm-track"
          ref={trackRef}
          style={{ width, height: 8 + manifest.storylines.length * 14 }}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            scrollToClientX(e.clientX)
          }}
          onPointerMove={(e) => {
            if (dragging.current) scrollToClientX(e.clientX)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
        >
          {layout.actRanges.slice(1).map(({ act, start }) => (
            <div key={act?.id ?? 'none'} className="mm-actline" style={{ left: start * MM_PITCH }} />
          ))}
          {[...layout.columns.entries()].map(([id, column]) => {
            const scene = scenes.get(id)
            if (!scene) return null
            const lanes = laneIndexes(scene, manifest)
            const cx = column * MM_PITCH + MM_PITCH / 2
            return (
              <span key={id} style={{ display: 'contents' }}>
                {lanes.length > 1 && (
                  <div
                    className="mm-link"
                    style={{
                      left: cx - 1,
                      top: laneTop(lanes[0]) + 4,
                      height: laneTop(lanes[lanes.length - 1]) - laneTop(lanes[0]),
                    }}
                  />
                )}
                {lanes.map((lane) => (
                  <div
                    key={lane}
                    className="mm-node"
                    title={scene.title}
                    style={{
                      left: cx - 7,
                      top: laneTop(lane),
                      background: manifest.storylines[lane].color,
                    }}
                  />
                ))}
              </span>
            )
          })}
          <div className="mm-viewport" style={{ left: viewport.left, width: viewport.width }} />
        </div>
      </div>
    </div>
  )
}
