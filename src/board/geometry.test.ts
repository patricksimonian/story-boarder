import { describe, expect, test } from 'vitest'
import type { Act } from '../domain/types'
import { boardGeometry, columnAt, COL_GAP, COL_WIDTH, pixelOf } from './geometry'
import type { BoardLayout } from './layout'

const act = (id: string, title: string): Act => ({ id, title })

/** A layout with one act per entry, each spanning the given number of columns. */
function layoutOf(spans: [Act | null, number][]): BoardLayout {
  const actRanges: BoardLayout['actRanges'] = []
  let next = 0
  for (const [a, span] of spans) {
    actRanges.push({ act: a, start: next, end: next + span - 1 })
    next += span
  }
  return { columns: new Map(), actOf: new Map(), actRanges, columnCount: next }
}

describe('boardGeometry', () => {
  test('columns keep the card width while every header fits its act', () => {
    const g = boardGeometry(layoutOf([[null, 1], [act('a', 'Short'), 2]]), () => 100)
    expect(g.widths).toEqual([COL_WIDTH, COL_WIDTH, COL_WIDTH])
    expect(g.lefts).toEqual([0, 160, 320, 480])
  })

  test('an act narrower than its header stretches its columns, evenly, to hold it', () => {
    const wide = act('long', 'The Last Kingdom of the Western Reach')
    const g = boardGeometry(layoutOf([[act('a', 'Act I'), 1], [wide, 2], [act('c', 'Act III'), 1]]), (title) =>
      title === wide.title ? 500 : 60,
    )
    // 500px across two columns and one 10px gutter: 245px each.
    expect(g.widths).toEqual([COL_WIDTH, 245, 245, COL_WIDTH])
    expect(g.lefts[3] - g.lefts[1] - COL_GAP).toBe(500)
  })

  test('the no-act range never stretches', () => {
    const g = boardGeometry(layoutOf([[null, 1]]), () => 999)
    expect(g.widths).toEqual([COL_WIDTH])
  })
})

describe('pixelOf and columnAt', () => {
  const g = boardGeometry(layoutOf([[act('a', 'A'), 1], [act('b', 'B'), 1], [act('c', 'C'), 1]]), (title) =>
    title === 'B' ? 300 : 0,
  )

  test('are inverses across columns of different widths', () => {
    for (const column of [-0.5, 0, 0.5, 1, 1.25, 2, 2.5, 3, 4.75]) {
      expect(columnAt(g, pixelOf(g, column))).toBeCloseTo(column)
    }
  })

  test('a fraction is a share of that column\'s own pitch', () => {
    expect(pixelOf(g, 1.5)).toBe(160 + 310 / 2)
    expect(columnAt(g, 160 + 310)).toBe(2)
  })

  test('an empty board falls back to the plain pitch', () => {
    const empty = boardGeometry(layoutOf([]))
    expect(pixelOf(empty, 2)).toBe(320)
    expect(columnAt(empty, 80)).toBe(0.5)
  })
})
