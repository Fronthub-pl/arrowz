import { defaultParams, generate, pieceShape } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { trackLine } from './track.ts'
import { DEFAULT_VIEW, hueBytes } from './view.ts'
import {
  frontOf,
  rideVertexBound,
  strokeOf,
  TAIL_SEGMENTS,
  tesselateBoard,
  tesselateColors,
  tesselatePiece,
} from './tesselate.ts'

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

const NONE: ReadonlySet<number> = new Set()

function board(seed = 7, extra: Partial<Board> = {}): Board {
  const r = generate({ ...defaultParams(), W: 30, H: 30, seed })
  return { ...r.board, ...extra }
}

/** Head at (5,5) facing right, one cell left, then two down: a corner right behind the head. */
const BENT: Piece = { id: 424242, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 }] }
/** A single cell facing right: its line is one point, so it has no segments at all. */
const DOT: Piece = { id: 7, dir: 1, cells: [{ x: 2, y: 2 }] }

/** Every vertex of a range, as [x, y] pairs. */
function points(positions: Float32Array, r: { start: number; count: number }): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < r.count; i++) {
    const x = positions[(r.start + i) * 2]
    const y = positions[(r.start + i) * 2 + 1]
    if (x === undefined || y === undefined) throw new Error('range runs past the buffer')
    out.push([x, y])
  }
  return out
}

test('the four blocks tile the buffer exactly: no gap, no overlap', () => {
  const b = board()
  const scene = tesselateBoard(b, { ...DEFAULT_VIEW, top: 3 }, NONE)
  const order = ['lines', 'topLines', 'heads', 'topHeads'] as const
  let at = 0
  for (const name of order) {
    expect(scene.blocks[name].start).toBe(at)
    at += scene.blocks[name].count
  }
  expect(positionsVertexCount(scene.positions)).toBe(at)
})

function positionsVertexCount(p: Float32Array): number {
  return p.length / 2
}

test('a straight piece contributes six vertices per segment', () => {
  const straight: Piece = { id: 1, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }] }
  const scene = tesselateBoard(board(7, { pieces: [straight] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(1)
  expect(r).not.toBeNull()
  // pieceShape emits one point per cell, so three cells make two segments.
  expect(r?.line.count).toBe(12)
})

test('the line is butt at its two outer ends; an interior join still fills', () => {
  // Horizontal (dir 1, dx=1 dy=0), so world x alone pins position along the
  // line and the test needs no projection arithmetic.
  const straight: Piece = { id: 99, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }] }
  const scene = tesselateBoard(board(7, { pieces: [straight] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(straight.id)
  if (!r) throw new Error('no range')
  const shape = pieceShape(straight, { cell: 1, pad: 0, width: DEFAULT_VIEW.stroke, headWidth: 0, headHeight: 0 })
  const half = DEFAULT_VIEW.stroke / 2
  const headX = at(shape.line, 0)[0]
  const jointX = at(shape.line, 1)[0]
  const tailX = at(shape.line, 2)[0]
  const pts = points(scene.positions, r.line)
  const f32 = (n: number): number => Math.fround(n)
  const x = (i: number): number | undefined => pts[i]?.[0]
  // First segment's "a" end (vertices 0, 3, 5 of writeSegment's fixed
  // layout): the polyline's own first point, square, not pushed out by half
  // a stroke the way the butt cap of `toSvg` never is either.
  expect(x(0)).toBe(f32(headX))
  expect(x(3)).toBe(f32(headX))
  expect(x(5)).toBe(f32(headX))
  // Last segment's "b" end (vertices 7, 8, 10 within its own six): likewise
  // the polyline's own last point, unextended — the tail disc rounds it, not
  // a square cap reaching past the disc's own radius.
  expect(x(7)).toBe(f32(tailX))
  expect(x(8)).toBe(f32(tailX))
  expect(x(10)).toBe(f32(tailX))
  // The interior join in between still extends by half a stroke on both
  // sides, so the corner is filled rather than left with a gap.
  expect(x(1)).toBe(f32(jointX - half))
  expect(x(2)).toBe(f32(jointX - half))
  expect(x(4)).toBe(f32(jointX - half))
  expect(x(6)).toBe(f32(jointX + half))
  expect(x(9)).toBe(f32(jointX + half))
  expect(x(11)).toBe(f32(jointX + half))
})

test('a one-cell piece has no line segments and still has a head and a tail', () => {
  const scene = tesselateBoard(board(7, { pieces: [DOT] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(DOT.id)
  expect(r?.line.count).toBe(0)
  const shape = pieceShape(DOT, { cell: 1, pad: 0, width: DEFAULT_VIEW.stroke, headWidth: 0, headHeight: 0 })
  expect(r?.head.count).toBe(3 * (shape.head.length - 2) + 3 * TAIL_SEGMENTS)
})

test('the head fan reproduces the polygon pieceShape describes', () => {
  const scene = tesselateBoard(board(7, { pieces: [BENT] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('no range')
  const shape = pieceShape(BENT, { cell: 1, pad: 0, width: DEFAULT_VIEW.stroke, headWidth: 0, headHeight: 0 })
  const fan = points(scene.positions, { start: r.head.start, count: 3 * (shape.head.length - 2) })
  // positions is a Float32Array (the buffer a GPU draws from), so a point
  // survives the round trip only at float32 precision: compare against the
  // same rounding, not against pieceShape's float64 output directly.
  const f32 = (p: [number, number]): [number, number] => [Math.fround(p[0]), Math.fround(p[1])]
  // A fan from the first point: every triangle starts there.
  for (let t = 0; t < shape.head.length - 2; t++) {
    expect(fan[t * 3]).toEqual(f32(at(shape.head, 0)))
    expect(fan[t * 3 + 1]).toEqual(f32(at(shape.head, t + 1)))
    expect(fan[t * 3 + 2]).toEqual(f32(at(shape.head, t + 2)))
  }
})

test('an omitted piece has no range and takes no space', () => {
  const b = board()
  const gone = b.pieces[0]
  if (!gone) throw new Error('need a piece')
  const all = tesselateBoard(b, DEFAULT_VIEW, NONE)
  const without = tesselateBoard(b, DEFAULT_VIEW, new Set([gone.id]))
  expect(without.rangeOf(gone.id)).toBeNull()
  expect(without.positions.length).toBeLessThan(all.positions.length)
  expect(without.drawnIds()).not.toContain(gone.id)
})

test('zeroing one piece leaves its neighbours byte for byte', () => {
  const b = board()
  const scene = tesselateBoard(b, DEFAULT_VIEW, NONE)
  const victim = b.pieces[1]
  const witness = b.pieces[2]
  if (!victim || !witness) throw new Error('need three pieces')
  const vr = scene.rangeOf(victim.id)
  const wr = scene.rangeOf(witness.id)
  if (!vr || !wr) throw new Error('no ranges')
  const before = points(scene.positions, wr.line)
  scene.positions.fill(0, vr.line.start * 2, (vr.line.start + vr.line.count) * 2)
  expect(points(scene.positions, wr.line)).toEqual(before)
})

test('the top pieces are the longest ones and land in their own blocks', () => {
  const b = board()
  const view = { ...DEFAULT_VIEW, top: 2 }
  const scene = tesselateBoard(b, view, NONE)
  const longest = [...b.pieces].sort((x, y) => y.cells.length - x.cells.length).slice(0, 2)
  for (const pc of longest) {
    const r = scene.rangeOf(pc.id)
    expect(r?.top).toBe(true)
    expect(r?.line.start).toBeGreaterThanOrEqual(scene.blocks.topLines.start)
    expect(r?.line.start).toBeLessThan(scene.blocks.topLines.start + scene.blocks.topLines.count)
  }
})

test('an omitted piece takes no highlight slot from the board that is left', () => {
  const b = board()
  const view = { ...DEFAULT_VIEW, top: 2 }
  const longest = [...b.pieces].sort((x, y) => y.cells.length - x.cells.length)
  const gone = longest[0]
  if (!gone) throw new Error('need a piece')
  const highlighted = (scene: ReturnType<typeof tesselateBoard>): number[] =>
    scene.drawnIds().filter((id) => scene.rangeOf(id)?.top === true)

  // The longest piece of all is one of the two highlighted, until it is the
  // one the session has removed.
  expect(highlighted(tesselateBoard(b, view, NONE))).toContain(gone.id)

  const without = tesselateBoard(b, view, new Set([gone.id]))
  const tops = highlighted(without)
  // Two, not one: a restored game omits the pieces that left, and an omitted
  // piece that kept its slot would leave the board a highlight short.
  expect(tops.length).toBe(view.top)
  expect(tops).not.toContain(gone.id)
})

test('a highlighted piece is drawn thicker, as toSvg draws it', () => {
  expect(strokeOf(DEFAULT_VIEW, false)).toBe(0.5)
  // 0.5 * 1.15 is 0.575 in exact arithmetic, but toFixed(2) rounds off the
  // double's actual binary value, which sits fractionally under 0.575: the
  // same rounding `toSvg`'s own highlight width performs, so the CLI's
  // export and the board on screen draw a highlighted piece alike.
  expect(strokeOf(DEFAULT_VIEW, true)).toBe(0.57)
  expect(strokeOf({ ...DEFAULT_VIEW, colored: true }, true)).toBe(0.75) // 0.5 * 1.5
})

test('a ridden piece follows trackLine, corners included', () => {
  const view = DEFAULT_VIEW
  const front = frontOf(BENT, view, false, BENT.dir)
  const out = new Float32Array(rideVertexBound(BENT) * 2)
  const count = tesselatePiece(BENT, view, false, { dir: BENT.dir, front, shift: 0.5 }, out)
  const expected = trackLine(BENT.cells, BENT.dir, front, 0.5)
  const shape = pieceShape(BENT, { cell: 1, pad: 0, width: DEFAULT_VIEW.stroke, headWidth: 0, headHeight: 0 })
  // Six vertices per segment, a fan over the head polygon, and the tail disc.
  const want = 6 * (expected.length - 1) + 3 * (shape.head.length - 2) + 3 * TAIL_SEGMENTS
  expect(count).toBe(want)
  // The corner survives the ride: trackLine emits every cell centre still
  // between the two moving ends, so a bent piece never straightens. BENT has
  // four cells; at shift 0.5 the two ends have moved onto the ray in front of
  // cell 0 and between cells 2 and 3, leaving the centres of cells 0, 1 and 2
  // still between them — two ends plus three centres is five points.
  expect(expected.length).toBe(5)
})

test('a ride never writes past the bound the layer allocates', () => {
  const view = DEFAULT_VIEW
  const bound = rideVertexBound(BENT)
  const out = new Float32Array(bound * 2)
  const front = frontOf(BENT, view, false, BENT.dir)
  for (const shift of [0, 0.01, 0.5, 1, 1.5, 2, 3, 3.99, 4, 10]) {
    const count = tesselatePiece(BENT, view, false, { dir: BENT.dir, front, shift }, out)
    expect(count).toBeLessThanOrEqual(bound)
  }
})

test('the colour buffer carries hueBytes for every vertex of a piece', () => {
  const b = board(7, { pieces: [BENT] })
  const view = { ...DEFAULT_VIEW, colored: true }
  const scene = tesselateBoard(b, view, NONE)
  const colors = tesselateColors(scene)
  expect(colors.length).toBe(scene.positions.length / 2 * 4)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('no range')
  const i = r.head.start * 4
  expect([colors[i], colors[i + 1], colors[i + 2]]).toEqual(hueBytes(BENT.id))
  expect(colors[i + 3]).toBe(255)
})
