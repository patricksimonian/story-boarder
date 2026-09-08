import type { BoardLayout } from './layout'

/** A scene card's column on the Storylines board, and the gutter between columns. */
export const COL_WIDTH = 150
export const COL_GAP = 10

/**
 * Pixel geometry of the board's columns. Every column is COL_WIDTH wide
 * unless its act's header doesn't fit across the act: an act with one
 * scene and a long title is one column wide, and the title would run into
 * the next act's header. Such an act stretches its columns, evenly, until
 * the header fits with room to spare. Everything that translates between
 * board pixels and columns — the grid template, drop positions, the
 * minimap's viewport, the ←/→ act jump — reads this, so they agree.
 */
export interface BoardGeometry {
  /** Width of each column, by column index. */
  widths: number[]
  /** Left edge of each column from column 0's left edge, plus one more: where a column after the last would begin. */
  lefts: number[]
}

export function boardGeometry(layout: BoardLayout, headerWidth: (title: string) => number = actHeaderWidth): BoardGeometry {
  const widths: number[] = Array(layout.columnCount).fill(COL_WIDTH)
  for (const { act, start, end } of layout.actRanges) {
    if (!act) continue
    const span = end - start + 1
    const natural = span * COL_WIDTH + (span - 1) * COL_GAP
    const needed = headerWidth(act.title)
    if (needed <= natural) continue
    const width = Math.ceil(COL_WIDTH + (needed - natural) / span)
    for (let c = start; c <= end; c++) widths[c] = width
  }
  const lefts = [0]
  for (const w of widths) lefts.push(lefts[lefts.length - 1] + w + COL_GAP)
  return { widths, lefts }
}

/** The pixel offset of a fractional column: 2.5 is the centre of column 2's pitch. Past either end, the nearest column's pitch carries on. */
export function pixelOf(g: BoardGeometry, column: number): number {
  const count = g.widths.length
  if (count === 0) return column * (COL_WIDTH + COL_GAP)
  const i = Math.min(Math.max(Math.floor(column), 0), count - 1)
  return g.lefts[i] + (column - i) * (g.widths[i] + COL_GAP)
}

/** The fractional column at a pixel offset — the inverse of pixelOf. */
export function columnAt(g: BoardGeometry, x: number): number {
  const count = g.widths.length
  if (count === 0) return x / (COL_WIDTH + COL_GAP)
  let i = 0
  while (i < count - 1 && x >= g.lefts[i + 1]) i++
  return i + (x - g.lefts[i]) / (g.widths[i] + COL_GAP)
}

// The act header's type, as .b-acthead sets it: 11.5px, uppercase, with
// 0.12em of letter-spacing after every character.
const HEADER_FONT_SIZE = 11.5
const HEADER_TRACKING = 0.12 * HEADER_FONT_SIZE
// Around the title: its 10px left padding, the ⤢ zoom glyph after it, the
// ✎ pencil button beside that, and a gutter so the next act's dashed rule
// stands clear of the pencil.
const HEADER_CHROME = 76

/**
 * How wide an act's header needs its act to be: the title measured in the
 * header's font, plus the header's chrome. Measures on a canvas; where
 * there is none (jsdom), estimates from the character count.
 */
export function actHeaderWidth(title: string): number {
  const text = title.toUpperCase()
  const ctx = context()
  const glyphs = ctx ? ctx.measureText(text).width : text.length * HEADER_FONT_SIZE * 0.7
  return Math.ceil(glyphs + text.length * HEADER_TRACKING + HEADER_CHROME)
}

let cached: CanvasRenderingContext2D | null | undefined

/** A measuring context set to the header's font, made once; null where the platform has no canvas. */
function context(): CanvasRenderingContext2D | null {
  if (cached !== undefined) return cached
  cached = null
  if (typeof CanvasRenderingContext2D === 'undefined') return cached
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return cached
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif'
  ctx.font = `${HEADER_FONT_SIZE}px ${family}`
  cached = ctx
  return cached
}
