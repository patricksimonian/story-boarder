import { describe, expect, test } from 'vitest'
import { serializeSketch, type Stroke } from './svg'

describe('serializeSketch', () => {
  test('strokes become polyline paths in a standalone SVG', () => {
    const strokes: Stroke[] = [
      { width: 3, points: [[10, 20], [30, 40], [50, 40]] },
      { width: 8, points: [[5, 5], [6, 7]] },
    ]
    const svg = serializeSketch(strokes, 320, 200)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"')
    expect(svg).toContain('d="M 10 20 L 30 40 L 50 40"')
    expect(svg).toContain('d="M 5 5 L 6 7"')
    expect(svg).toContain('stroke-width="3"')
    expect(svg).toContain('stroke-width="8"')
  })

  test('a single tap still leaves a visible dot', () => {
    const svg = serializeSketch([{ width: 3, points: [[12, 12]] }], 100, 100)
    expect(svg).toContain('M 12 12 L 12 12')
  })

  test('coordinates round to keep the file small', () => {
    const svg = serializeSketch([{ width: 3, points: [[10.4567, 19.9999]] }], 100, 100)
    expect(svg).toContain('M 10.5 20 L')
  })
})
