/**
 * The sketchpad's on-disk form: strokes recorded from the pointer,
 * written out as a standalone SVG — a plain file any viewer opens, in
 * keeping with everything else in the story folder. No canvas API
 * anywhere; the drawing surface is an inline <svg> and this is its
 * serializer.
 */

export interface Stroke {
  width: number
  points: [number, number][]
}

const round = (n: number) => Math.round(n * 2) / 2

export function strokePath(stroke: Stroke): string {
  const [first, ...rest] = stroke.points
  const tail = rest.length === 0 ? [first] : rest
  return `M ${round(first[0])} ${round(first[1])}${tail.map(([x, y]) => ` L ${round(x)} ${round(y)}`).join('')}`
}

export function serializeSketch(strokes: Stroke[], width: number, height: number): string {
  const paths = strokes
    .filter((s) => s.points.length > 0)
    .map(
      (s) =>
        `  <path d="${strokePath(s)}" fill="none" stroke="#1a1712" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n<rect width="100%" height="100%" fill="#fdfbf7"/>\n${paths}\n</svg>\n`
}
