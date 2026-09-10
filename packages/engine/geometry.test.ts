import { assert, assertEquals } from '@std/assert'
import { at, DIRS, type PieceShape, pieceShape, voidStrips } from './geometry.ts'
import type { Board, Piece } from './types.ts'

// A three-cell piece heading right: head at (2,0), body at (1,0), tail at (0,0).
const right: Piece = { id: 7, cells: [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], dir: 1 }

Deno.test('DIRS is up, right, down, left', () => {
  assertEquals(DIRS.map((d) => [d.dx, d.dy]), [[0, -1], [1, 0], [0, 1], [-1, 0]])
})

Deno.test('a thin line gets a three-point arrow head with the tip 0.48 past the head centre; a stick gets a five-point collar', () => {
  const s = pieceShape(right, { cell: 1, pad: 0, width: 0.5, headWidth: 0, headHeight: 1 })
  // width 0.5 with cell 1 is the "stick" threshold: w >= 0.5*cell, so this is a stick.
  // Use 0.3 for the arrow case. Both are a cell tall: the height is never worked out.
  const arrow = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0, headHeight: 1 })
  assertEquals(arrow.head[0], [2.5 + 0.48, 0.5])
  assertEquals(arrow.head.length, 3)
  assertEquals(s.head.length, 5) // a stick needs the collar
})

Deno.test('the line starts at the head base plus the overlap and runs through the remaining cells', () => {
  const s = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0, headHeight: 1 })
  const tip = 2.5 + 0.48
  const base = tip - 1 // the head height, one cell, taken as it is given
  assertEquals(s.line[0], [base + 0.2 * 0.3, 0.5]) // lap = 0.2 * width
  assertEquals(s.line.slice(1), [[1.5, 0.5], [0.5, 0.5]])
  assertEquals(s.tail, { x: 0.5, y: 0.5, r: 0.15 })
})

Deno.test('cell and pad scale every coordinate the same way', () => {
  const unit = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0, headHeight: 1 })
  const big = pieceShape(right, { cell: 16, pad: 16, width: 4.8, headWidth: 0, headHeight: 1 })
  for (let i = 0; i < unit.line.length; i++) {
    const [ux, uy] = unit.line[i] ?? [NaN, NaN]
    const [bx, by] = big.line[i] ?? [NaN, NaN]
    assert(Math.abs(bx - (16 + ux * 16)) < 1e-9 && Math.abs(by - (16 + uy * 16)) < 1e-9, `line point ${i}`)
  }
})

Deno.test('a head narrower than its line is widened to the line', () => {
  const s = pieceShape(right, { cell: 1, pad: 0, width: 0.3, headWidth: 0.1, headHeight: 1 })
  const [sx, sy] = s.head[1] ?? [NaN, NaN] // the first side point
  assert(Math.abs(Math.abs(sy - 0.5) - 0.15) < 1e-9, `half width is the line's radius, got ${sy}`)
  assert(Number.isFinite(sx))
})

// A two-cell piece heading right, so the head sits at (0,0) and the head axis
// is the x axis: the distance between the tip and a base corner is the height.
const two: Piece = { id: 0, dir: 1, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
/** The head's height along its axis: the tip minus a base corner, both on the x axis for a piece heading right. */
const headHeightOf = (s: PieceShape): number => Math.abs(at(s.head, 0)[0] - at(s.head, 1)[0])

Deno.test('the head height is literal, not automatic', () => {
  const tall = pieceShape(two, { cell: 10, pad: 0, width: 5, headWidth: 0, headHeight: 1 })
  const short = pieceShape(two, { cell: 10, pad: 0, width: 5, headWidth: 0, headHeight: 0.5 })
  assertEquals(headHeightOf(tall), 10)
  assertEquals(headHeightOf(short), 5)
})

Deno.test('a head height of zero draws no head, and says so', () => {
  const s = pieceShape(two, { cell: 10, pad: 0, width: 5, headWidth: 0, headHeight: 0 })
  assertEquals(at(s.head, 0)[0], at(s.head, 1)[0])
})

Deno.test('voidStrips merges empty cells into horizontal runs', () => {
  const W = 4, H = 2
  const owner = new Int32Array([0, -1, -1, 0, -1, 1, 1, -1])
  const board: Board = {
    W,
    H,
    owner,
    pieces: [],
    stats: { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0 },
    backtracks: 0,
    remaining: 4,
  }
  assertEquals(voidStrips(board), [{ x: 1, y: 0, len: 2 }, { x: 0, y: 1, len: 1 }, { x: 3, y: 1, len: 1 }])
})
