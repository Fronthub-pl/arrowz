// The board as triangles: pieceShape() expanded into vertices a GPU can draw,
// with a map from piece id to its slice of the buffer, so a removal or a ride
// touches one piece and never the board. Knows neither DOM nor WebGL, so it is
// tested in Node like viewport.ts and track.ts.
import { DIRS, pieceShape } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { trackLine, trackPoint } from './track.ts'
import { type BoardView, hueBytes } from './view.ts'

/**
 * Triangles in the tail rounding's fan. The rounding is half a stroke across,
 * so at MAX_CELL_PX (48) it spans some 24 device pixels, where eight segments
 * already read as round.
 */
export const TAIL_SEGMENTS = 8

/** The most points a head polygon can have: tip, two sides and a two-point collar. */
const MAX_HEAD_POINTS = 5

export interface Range {
  start: number
  count: number
}

export type Block = 'lines' | 'topLines' | 'heads' | 'topHeads'

/** Where a piece is along its own track; null means at rest. */
export interface Ride {
  dir: number
  front: number
  shift: number
}

export interface PieceRanges {
  line: Range
  head: Range
  top: boolean
}

export interface Scene {
  /** Triangle vertices, x and y interleaved, in cells. */
  positions: Float32Array
  /** Where each block starts and how long it is, in vertices, in draw order. */
  blocks: Readonly<Record<Block, Range>>
  rangeOf(id: number): PieceRanges | null
  drawnIds(): number[]
}

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/** The stroke a piece is drawn with: highlighted ones are thicker, as in toSvg. */
export function strokeOf(view: BoardView, top: boolean): number {
  if (!top) return view.stroke
  return Number((view.stroke * (view.colored ? 1.5 : 1.15)).toFixed(2))
}

function shapeOf(piece: Piece, view: BoardView, top: boolean) {
  return pieceShape(piece, {
    cell: 1,
    pad: 0,
    width: strokeOf(view, top),
    headWidth: view.headWidth,
    headHeight: view.headHeight,
  })
}

/**
 * How far behind the head centre the piece's line begins, in cells. Measured
 * off the drawn shape rather than worked out again, because it depends on the
 * stroke width of this very piece.
 */
export function frontOf(piece: Piece, view: BoardView, top: boolean, dir: number): number {
  const s = shapeOf(piece, view, top)
  const d = at(DIRS, dir)
  const head = at(piece.cells, 0)
  const p = at(s.line, 0)
  return -((p[0] - (head.x + 0.5)) * d.dx + (p[1] - (head.y + 0.5)) * d.dy)
}

const lineVertices = (points: number): number => (points <= 1 ? 0 : 6 * (points - 1))
const headVertices = (points: number): number => 3 * (points - 2) + 3 * TAIL_SEGMENTS

/**
 * The most vertices a ride of this piece can need. `trackLine` emits the two
 * moving ends plus every cell centre still between them, so it is at most two
 * points longer than the resting line; the head takes its widest form.
 */
export function rideVertexBound(piece: Piece): number {
  return lineVertices(piece.cells.length + 2) + headVertices(MAX_HEAD_POINTS)
}

/** Two triangles for one segment, extended by `half` at both ends so joins fill. */
function writeSegment(
  out: Float32Array,
  o: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  half: number,
): number {
  let dx = x1 - x0, dy = y1 - y0
  const len = Math.hypot(dx, dy)
  // A zero-length segment cannot be given a direction; trackLine dedupes
  // repeated points, so this only guards against a degenerate piece.
  if (len === 0) return o
  dx /= len
  dy /= len
  const ax = x0 - dx * half, ay = y0 - dy * half
  const bx = x1 + dx * half, by = y1 + dy * half
  const nx = -dy * half, ny = dx * half
  const put = (x: number, y: number): void => {
    out[o++] = x
    out[o++] = y
  }
  put(ax + nx, ay + ny)
  put(bx + nx, by + ny)
  put(bx - nx, by - ny)
  put(ax + nx, ay + ny)
  put(bx - nx, by - ny)
  put(ax - nx, ay - ny)
  return o
}

/** A polygon as a fan from its first point, every vertex shifted by (tx, ty). */
function writeFan(out: Float32Array, o: number, pts: readonly [number, number][], tx: number, ty: number): number {
  const first = at(pts, 0)
  for (let i = 1; i < pts.length - 1; i++) {
    const b = at(pts, i), c = at(pts, i + 1)
    out[o++] = first[0] + tx
    out[o++] = first[1] + ty
    out[o++] = b[0] + tx
    out[o++] = b[1] + ty
    out[o++] = c[0] + tx
    out[o++] = c[1] + ty
  }
  return o
}

/** The tail rounding as a fan of TAIL_SEGMENTS triangles. */
function writeDisc(out: Float32Array, o: number, cx: number, cy: number, r: number): number {
  const step = (Math.PI * 2) / TAIL_SEGMENTS
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a = i * step, b = a + step
    out[o++] = cx
    out[o++] = cy
    out[o++] = cx + Math.cos(a) * r
    out[o++] = cy + Math.sin(a) * r
    out[o++] = cx + Math.cos(b) * r
    out[o++] = cy + Math.sin(b) * r
  }
  return o
}

/** The ids of the `view.top` longest pieces that will actually be drawn. */
function topIds(board: Board, view: BoardView, omit: ReadonlySet<number>): Set<number> {
  if (view.top <= 0) return new Set<number>()
  // Built from the pieces that will be drawn: an omitted one must not take a
  // slot and leave fewer than N pieces highlighted.
  const drawn = board.pieces.filter((pc) => !omit.has(pc.id))
  drawn.sort((a, b) => b.cells.length - a.cells.length)
  return new Set(drawn.slice(0, view.top).map((p) => p.id))
}

export function tesselateBoard(board: Board, view: BoardView, omit: ReadonlySet<number>): Scene {
  const tops = topIds(board, view, omit)
  const drawn = board.pieces.filter((pc) => !omit.has(pc.id))

  // Two passes over the pieces, and pieceShape called in both. Once would need
  // the head's point count known in advance, and only pieceShape may decide
  // whether a head has four points or five — deriving it here again is exactly
  // the divergence geometry.ts exists to prevent.
  const counts = new Map<number, { line: number; head: number }>()
  const size: Record<Block, number> = { lines: 0, topLines: 0, heads: 0, topHeads: 0 }
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const s = shapeOf(pc, view, top)
    const line = lineVertices(s.line.length)
    const head = headVertices(s.head.length)
    counts.set(pc.id, { line, head })
    size[top ? 'topLines' : 'lines'] += line
    size[top ? 'topHeads' : 'heads'] += head
  }

  const order: readonly Block[] = ['lines', 'topLines', 'heads', 'topHeads']
  const blocks: Record<Block, Range> = {
    lines: { start: 0, count: 0 },
    topLines: { start: 0, count: 0 },
    heads: { start: 0, count: 0 },
    topHeads: { start: 0, count: 0 },
  }
  let start = 0
  for (const name of order) {
    blocks[name] = { start, count: size[name] }
    start += size[name]
  }

  const positions = new Float32Array(start * 2)
  const cursor: Record<Block, number> = {
    lines: blocks.lines.start,
    topLines: blocks.topLines.start,
    heads: blocks.heads.start,
    topHeads: blocks.topHeads.start,
  }
  const ranges = new Map<number, PieceRanges>()
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const c = counts.get(pc.id)
    if (!c) continue
    const s = shapeOf(pc, view, top)
    const half = strokeOf(view, top) / 2
    const lineBlock: Block = top ? 'topLines' : 'lines'
    const headBlock: Block = top ? 'topHeads' : 'heads'

    const lineStart = cursor[lineBlock]
    let o = lineStart * 2
    for (let i = 1; i < s.line.length; i++) {
      const a = at(s.line, i - 1), b = at(s.line, i)
      o = writeSegment(positions, o, a[0], a[1], b[0], b[1], half)
    }
    cursor[lineBlock] = lineStart + c.line

    const headStart = cursor[headBlock]
    o = writeFan(positions, headStart * 2, s.head, 0, 0)
    writeDisc(positions, o, s.tail.x, s.tail.y, s.tail.r)
    cursor[headBlock] = headStart + c.head

    ranges.set(pc.id, {
      line: { start: lineStart, count: c.line },
      head: { start: headStart, count: c.head },
      top,
    })
  }

  return {
    positions,
    blocks,
    rangeOf: (id) => ranges.get(id) ?? null,
    drawnIds: () => [...ranges.keys()],
  }
}

/**
 * The colour of every vertex, four bytes each, for the diagnostic mode. Built
 * only when colours are switched on (see the layer), so a monochrome board
 * never allocates it.
 */
export function tesselateColors(scene: Scene, _view: BoardView): Uint8Array {
  const vertices = scene.positions.length / 2
  const colors = new Uint8Array(vertices * 4)
  for (const id of scene.drawnIds()) {
    const r = scene.rangeOf(id)
    if (!r) continue
    const [red, green, blue] = hueBytes(id)
    for (const range of [r.line, r.head]) {
      for (let i = 0; i < range.count; i++) {
        const o = (range.start + i) * 4
        colors[o] = red
        colors[o + 1] = green
        colors[o + 2] = blue
        colors[o + 3] = 255
      }
    }
  }
  return colors
}

/**
 * One piece's triangles into a caller-owned buffer, at rest or part way down
 * its own track. Returns the vertex count written, never more than
 * `rideVertexBound(piece)`.
 */
export function tesselatePiece(
  piece: Piece,
  view: BoardView,
  top: boolean,
  ride: Ride | null,
  out: Float32Array,
): number {
  const s = shapeOf(piece, view, top)
  const half = strokeOf(view, top) / 2
  const line = ride === null ? s.line : trackLine(piece.cells, ride.dir, ride.front, ride.shift)
  let o = 0
  for (let i = 1; i < line.length; i++) {
    const a = at(line, i - 1), b = at(line, i)
    o = writeSegment(out, o, a[0], a[1], b[0], b[1], half)
  }
  const d = ride === null ? { dx: 0, dy: 0 } : at(DIRS, ride.dir)
  const shift = ride === null ? 0 : ride.shift
  o = writeFan(out, o, s.head, d.dx * shift, d.dy * shift)
  const last = piece.cells.length - 1
  const [tx, ty] = ride === null ? [s.tail.x, s.tail.y] : trackPoint(piece.cells, ride.dir, last - shift)
  o = writeDisc(out, o, tx, ty, s.tail.r)
  return o / 2
}
