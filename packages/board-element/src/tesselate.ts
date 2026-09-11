// The board as triangles: pieceShape() expanded into vertices a GPU can draw,
// with a map from piece id to its slice of the buffer, so a removal or a ride
// touches one piece and never the board. Knows neither DOM nor WebGL, so it is
// tested in Node like viewport.ts and track.ts.
import { DIRS, pieceShape } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { trackLine, trackPoint } from './track.ts'
import { type BoardView, hueBytes } from './view.ts'

/**
 * Triangles in the tail rounding's fan.
 *
 * The rounding's radius is a quarter of a cell, so at MAX_CELL_PX (48) on a
 * dpr 2 screen it is 24 device pixels — the figure the original eight was
 * chosen against was that same number at dpr 1, and no screen this runs on is
 * dpr 1. The sagitta of an n-gon at radius r is `r(1 - cos(pi/n))`; holding
 * it under half a device pixel at r = 24 needs n above 15.4, and eight facets
 * are plain to the eye at that size. Sixteen costs eight more triangles per
 * piece and puts the flattening under the pixel grid.
 */
export const TAIL_SEGMENTS = 16

/**
 * Triangles in the fan that rounds one corner.
 *
 * A piece only ever turns through a right angle, so the fan sweeps a quarter
 * and its facets are those of a `4 * JOIN_SEGMENTS`-gon. The sagitta rule of
 * TAIL_SEGMENTS applies at the corner's own radius, which is the widest a
 * corner is ever drawn with: the panel's maximum `stroke` of 0.9, times the
 * 1.5 the colour mode's highlight applies (`strokeOf`), is 1.35 of a cell. At
 * MAX_CELL_PX (48) on a dpr 2 screen that is 64.8 device pixels, and
 * `64.8 * (1 - cos(pi / 4k)) < 0.5` needs k above 6.32. A host is free to set
 * `view.stroke` past what the panel offers; the cost there is visible
 * faceting on that corner, not anything breaking.
 */
export const JOIN_SEGMENTS = 7

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

/** Whether the polyline turns at its i-th point; the game only turns by a right angle. */
function turnsAt(line: readonly [number, number][], i: number): boolean {
  const a = at(line, i - 1), b = at(line, i), c = at(line, i + 1)
  return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9
}

/** How many of a polyline's interior points are corners rather than straights. */
function cornersIn(line: readonly [number, number][]): number {
  let n = 0
  for (let i = 1; i < line.length - 1; i++) {
    if (turnsAt(line, i)) n++
  }
  return n
}

const segmentVertices = (points: number): number => (points <= 1 ? 0 : 6 * (points - 1))

/**
 * A polyline with its collinear runs collapsed into single segments.
 *
 * `pieceShape` pushes the centre of every cell into `line`, so a piece running
 * straight through six cells carries five 180-degree joins that cost two
 * triangles each and change nothing. Collapsing them is a debt this file has
 * carried since it was written, and it is what pays for the corner fans.
 */
function mergeCollinear(line: readonly [number, number][]): readonly [number, number][] {
  if (line.length < 3) return line
  const out: [number, number][] = [at(line, 0)]
  for (let i = 1; i < line.length - 1; i++) {
    if (turnsAt(line, i)) out.push(at(line, i))
  }
  out.push(at(line, line.length - 1))
  return out
}

/** The vertices one polyline takes, its corner fans included. */
function lineVerticesOf(line: readonly [number, number][], rounded: boolean): number {
  const l = mergeCollinear(line)
  return segmentVertices(l.length) + (rounded ? 3 * JOIN_SEGMENTS * cornersIn(l) : 0)
}

const headVertices = (points: number, rounded: boolean): number => 3 * (points - 2) + (rounded ? 3 * TAIL_SEGMENTS : 6)

/**
 * The most vertices a ride of this piece can need. `trackLine` emits the two
 * moving ends plus every cell centre still between them, so it is at most two
 * points longer than the resting line; the head takes its widest form.
 */
export function rideVertexBound(piece: Piece): number {
  const points = piece.cells.length + 2
  // Every interior point may be a corner, and a rounded tail is the larger cap.
  const worstLine = segmentVertices(points) + 3 * JOIN_SEGMENTS * Math.max(points - 2, 0)
  return worstLine + headVertices(MAX_HEAD_POINTS, true)
}

/**
 * Two triangles for one segment. `startExtend`/`endExtend` say whether that
 * end reaches `half` further out so an interior join fills — the polyline's
 * two outer ends must not: the piece is drawn the way `toSvg` draws it, with
 * a butt cap, and the tail is rounded by its own disc, so a square cap out
 * there would reach `0.707 * w` into its corners, past that disc's radius,
 * and bury the disc's triangles under geometry nothing ever shows.
 */
function writeSegment(
  out: Float32Array,
  o: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  half: number,
  startExtend: boolean,
  endExtend: boolean,
): number {
  let dx = x1 - x0, dy = y1 - y0
  const len = Math.hypot(dx, dy)
  // A zero-length segment cannot be given a direction; trackLine dedupes
  // repeated points, so this only guards against a degenerate piece.
  if (len === 0) return o
  dx /= len
  dy /= len
  const startHalf = startExtend ? half : 0
  const endHalf = endExtend ? half : 0
  const ax = x0 - dx * startHalf, ay = y0 - dy * startHalf
  const bx = x1 + dx * endHalf, by = y1 + dy * endHalf
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

/**
 * A polyline as segments, in order. Only interior joins extend by `half`;
 * the first point of the first segment and the last point of the last
 * segment are the polyline's own two outer ends, and stay put. Rounded turns
 * are covered instead by a fan written after every segment.
 */
function writeLine(
  out: Float32Array,
  o: number,
  raw: readonly [number, number][],
  half: number,
  rounded: boolean,
): number {
  const line = mergeCollinear(raw)
  const last = line.length - 1
  for (let i = 1; i <= last; i++) {
    const a = at(line, i - 1), b = at(line, i)
    // A rounded corner is filled by its own fan, so the segments meeting there
    // must stop at the corner: a square extension would poke out past the arc.
    const startExtend = i > 1 && !(rounded && turnsAt(line, i - 1))
    const endExtend = i < last && !(rounded && turnsAt(line, i))
    o = writeSegment(out, o, a[0], a[1], b[0], b[1], half, startExtend, endExtend)
  }
  if (!rounded) return o
  for (let i = 1; i < last; i++) {
    if (turnsAt(line, i)) o = writeJoin(out, o, line, i, half)
  }
  return o
}

/**
 * One corner as a quarter-turn fan. Two butt-ended segments meeting at a right
 * angle leave exactly one square of side `half` uncovered — the outer corner —
 * and this sweeps an arc of radius `half` across it. Which side is outer, and
 * which way the sweep runs, both come off the sign of the turn.
 */
function writeJoin(
  out: Float32Array,
  o: number,
  line: readonly [number, number][],
  i: number,
  half: number,
): number {
  const a = at(line, i - 1), b = at(line, i), c = at(line, i + 1)
  const ux = b[0] - a[0], uy = b[1] - a[1]
  const vx = c[0] - b[0], vy = c[1] - b[1]
  const turn = ux * vy - uy * vx > 0 ? 1 : -1
  const ul = Math.hypot(ux, uy)
  if (ul === 0) return o
  // The normal of the incoming segment that points away from the turn.
  const nx = (turn * uy) / ul, ny = (-turn * ux) / ul
  const a0 = Math.atan2(ny, nx)
  const step = (turn * Math.PI) / 2 / JOIN_SEGMENTS
  for (let k = 0; k < JOIN_SEGMENTS; k++) {
    const t0 = a0 + k * step, t1 = a0 + (k + 1) * step
    out[o++] = b[0]
    out[o++] = b[1]
    out[o++] = b[0] + Math.cos(t0) * half
    out[o++] = b[1] + Math.sin(t0) * half
    out[o++] = b[0] + Math.cos(t1) * half
    out[o++] = b[1] + Math.sin(t1) * half
  }
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

/** The square tail cap: the same reach as the disc it replaces, with flat sides. */
function writeSquare(out: Float32Array, o: number, cx: number, cy: number, half: number): number {
  const put = (x: number, y: number): void => {
    out[o++] = x
    out[o++] = y
  }
  put(cx - half, cy - half)
  put(cx + half, cy - half)
  put(cx + half, cy + half)
  put(cx - half, cy - half)
  put(cx + half, cy + half)
  put(cx - half, cy + half)
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
  // whether a head has three points or five — deriving it here again is exactly
  // the divergence geometry.ts exists to prevent.
  const counts = new Map<number, { line: number; head: number }>()
  const size: Record<Block, number> = { lines: 0, topLines: 0, heads: 0, topHeads: 0 }
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const s = shapeOf(pc, view, top)
    const line = lineVerticesOf(s.line, view.rounded)
    const head = headVertices(s.head.length, view.rounded)
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
    writeLine(positions, lineStart * 2, s.line, half, view.rounded)
    cursor[lineBlock] = lineStart + c.line

    const headStart = cursor[headBlock]
    const headEnd = writeFan(positions, headStart * 2, s.head, 0, 0)
    if (view.rounded) writeDisc(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
    else writeSquare(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
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
export function tesselateColors(scene: Scene): Uint8Array {
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
  let o = writeLine(out, 0, line, half, view.rounded)
  const d = ride === null ? { dx: 0, dy: 0 } : at(DIRS, ride.dir)
  const shift = ride === null ? 0 : ride.shift
  o = writeFan(out, o, s.head, d.dx * shift, d.dy * shift)
  const last = piece.cells.length - 1
  const [tx, ty] = ride === null ? [s.tail.x, s.tail.y] : trackPoint(piece.cells, ride.dir, last - shift)
  o = view.rounded ? writeDisc(out, o, tx, ty, s.tail.r) : writeSquare(out, o, tx, ty, s.tail.r)
  return o / 2
}
