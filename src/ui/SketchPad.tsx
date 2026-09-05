import { useRef, useState } from 'react'
import { serializeSketch, strokePath, type Stroke } from '../sketch/svg'

const W = 640
const H = 400

const PENS = [
  { label: 'Fine', width: 2 },
  { label: 'Ink', width: 4 },
  { label: 'Brush', width: 9 },
]

/**
 * The sketchpad: rough storyboard panels, drawn as strokes on an inline
 * SVG and saved as a standalone SVG file — a sketchpad, not an art
 * suite. One ink, three pens, undo. The host pins the saved panel to
 * the mood board like any other image.
 */
export function SketchPad({ onSave, onClose }: { onSave: (svgText: string) => void; onClose: () => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [live, setLive] = useState<Stroke | null>(null)
  const [pen, setPen] = useState(4)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Map from the rendered box back to the logical viewBox, so a
  // squeezed surface still records true coordinates.
  const point = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return [e.clientX, e.clientY]
    return [((e.clientX - rect.left) * W) / rect.width, ((e.clientY - rect.top) * H) / rect.height]
  }

  return (
    <div className="ed-section" role="group" aria-label="Sketchpad">
      <svg
        ref={svgRef}
        aria-label="Drawing surface"
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-2xl touch-none rounded border border-line bg-paper"
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          setLive({ width: pen, points: [point(e)] })
        }}
        onPointerMove={(e) => {
          if (live) setLive({ ...live, points: [...live.points, point(e)] })
        }}
        onPointerUp={() => {
          if (live) {
            setStrokes([...strokes, live])
            setLive(null)
          }
        }}
      >
        {[...strokes, ...(live ? [live] : [])].map((stroke, i) => (
          <path
            key={i}
            d={strokePath(stroke)}
            fill="none"
            stroke="#1a1712"
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-2">
        {PENS.map(({ label, width }) => (
          <label key={label} className="cursor-pointer text-sm">
            <input type="radio" name="pen" checked={pen === width} onChange={() => setPen(width)} /> {label}
          </label>
        ))}
        <button type="button" disabled={strokes.length === 0} onClick={() => setStrokes(strokes.slice(0, -1))}>
          Undo
        </button>
        <button type="button" disabled={strokes.length === 0} onClick={() => setStrokes([])}>
          Clear
        </button>
        <button type="button" disabled={strokes.length === 0} onClick={() => onSave(serializeSketch(strokes, W, H))}>
          Save panel
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
