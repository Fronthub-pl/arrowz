// The board as triangles plus discs: pieceShape() expanded into vertices a
// GPU can draw, and the tail caps and round joins into discs it can instance,
// with a map from piece id to its slice of each buffer, so a removal or a
// ride touches one piece and never the board. Knows neither DOM nor WebGL, so
// it is tested in Node like viewport.ts and track.ts.
import { DIRS, pieceShape } from '@arrowz/engine'
import type { BoardData, Piece } from '@arrowz/engine'
import { trackLine, trackPoint } from './track.ts'
import { type BoardView, hueBytes } from './view.ts'

/** The most points a head polygon can have: tip, two sides and a two-point collar. */
const MAX_HEAD_POINTS = 5

/** Floats a disc takes in `Scene.discs`: its centre, then its radius. */
export const FLOATS_PER_DISC = 3

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
  /** The piece's corner discs, inside its line block's discs. */
  corners: Range
  /** The piece's tail disc — one, or none when sharp — inside its head block's discs. */
  tail: Range
  top: boolean
}

export interface Scene {
  /** Triangle vertices, x and y interleaved, in cells. */
  positions: Float32Array
  /** Where each block starts and how long it is, in vertices, in draw order. */
  blocks: Readonly<Record<Block, Range>>
  /** Discs, as cx, cy and r interleaved, in cells: the tail caps and the round joins. */
  discs: Float32Array
  /** Where each block's discs start and how many there are, in discs, in the same order. */
  discBlocks: Readonly<Record<Block, Range>>
  /**
   * The radius every corner disc of a line block is drawn with, in cells:
   * half that block's stroke. The disc pass compares it with the zoom, so a
   * whole block of corners too small to see is never drawn.
   */
  cornerRadius: Readonly<Record<'lines' | 'topLines', number>>
  rangeOf(id: number): PieceRanges | null
  drawnIds(): number[]
}

/** How many vertices and discs one piece wrote. */
export interface Written {
  vertices: number
  discs: number
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
 * carried since it was written, and it is what pays for the corner discs.
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

/** The vertices one polyline takes, given its collinear runs already merged. */
function lineVerticesOf(line: readonly [number, number][]): number {
  return segmentVertices(line.length)
}

/** A head's fan, plus the sharp tail's square; a round tail is a disc, not triangles. */
const headVertices = (points: number, rounded: boolean): number => 3 * (points - 2) + (rounded ? 0 : 6)

/**
 * The most vertices a ride of this piece can need. `trackLine` emits the two
 * moving ends plus every cell centre still between them, so it is at most two
 * points longer than the resting line; the head takes its widest form, and
 * the tail the square.
 */
export function rideVertexBound(piece: Piece): number {
  const points = piece.cells.length + 2
  // The sharp tail's square is the only cap that costs triangles now.
  return segmentVertices(points) + headVertices(MAX_HEAD_POINTS, false)
}

/**
 * The most discs a ride of this piece can need. `trackLine` emits at most
 * `cells.length + 2` points, so a ride has at most `cells.length` interior
 * points, and so at most that many corners; the tail is one more.
 */
export function rideDiscBound(piece: Piece): number {
  return piece.cells.length + 1
}

/**
 * Two triangles for one segment. `startExtend`/`endExtend` say whether that
 * end reaches `half` further out so an interior join fills — the polyline's
 * two outer ends must not: the piece is drawn the way `toSvg` draws it, with
 * a butt cap, and the tail is rounded by its own disc, so a square cap out
 * there would reach `0.707 * w` into its corners, past that disc's radius,
 * and show as a square corner the disc cannot hide.
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
 * segment are the polyline's own two outer ends, and stay put. A rounded
 * turn is covered by a disc in the scene's disc stream instead (`writeCorners`).
 * `line` must already have its collinear runs merged: the caller merges once
 * and hands the result to both `writeLine` and `writeCorners`.
 */
function writeLine(
  out: Float32Array,
  o: number,
  line: readonly [number, number][],
  half: number,
  rounded: boolean,
): number {
  const last = line.length - 1
  for (let i = 1; i <= last; i++) {
    const a = at(line, i - 1), b = at(line, i)
    // A rounded corner is filled by its own disc, so the segments meeting there
    // must stop at the corner: a square extension would poke out past the arc.
    const startExtend = i > 1 && !(rounded && turnsAt(line, i - 1))
    const endExtend = i < last && !(rounded && turnsAt(line, i))
    o = writeSegment(out, o, a[0], a[1], b[0], b[1], half, startExtend, endExtend)
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

/**
 * A disc of radius `half` on every corner of the merged polyline: what
 * `stroke-linejoin="round"` draws. The disc is whole, not the quarter that
 * shows — the other three quarters lie under the two butt-ended segments that
 * meet there, so drawing them changes no pixel. `line` must already have its
 * collinear runs merged: the caller merges once and hands the result to both
 * `writeLine` and `writeCorners`.
 */
function writeCorners(out: Float32Array, o: number, line: readonly [number, number][], half: number): number {
  for (let i = 1; i < line.length - 1; i++) {
    if (!turnsAt(line, i)) continue
    const p = at(line, i)
    out[o++] = p[0]
    out[o++] = p[1]
    out[o++] = half
  }
  return o
}

/** The tail cap as one disc, where `pieceShape` puts it. */
function writeTailDisc(out: Float32Array, o: number, cx: number, cy: number, r: number): number {
  out[o++] = cx
  out[o++] = cy
  out[o++] = r
  return o
}

/** The ids of the `view.top` longest pieces that will actually be drawn. */
function topIds(board: BoardData, view: BoardView, omit: ReadonlySet<number>): Set<number> {
  if (view.top <= 0) return new Set<number>()
  // Built from the pieces that will be drawn: an omitted one must not take a
  // slot and leave fewer than N pieces highlighted.
  const drawn = board.pieces.filter((pc) => !omit.has(pc.id))
  drawn.sort((a, b) => b.cells.length - a.cells.length)
  return new Set(drawn.slice(0, view.top).map((p) => p.id))
}

const ORDER: readonly Block[] = ['lines', 'topLines', 'heads', 'topHeads']

/** Blocks laid back to back in draw order, from how long each one is. */
function layOut(size: Readonly<Record<Block, number>>): Record<Block, Range> {
  const out: Record<Block, Range> = {
    lines: { start: 0, count: 0 },
    topLines: { start: 0, count: 0 },
    heads: { start: 0, count: 0 },
    topHeads: { start: 0, count: 0 },
  }
  let start = 0
  for (const name of ORDER) {
    out[name] = { start, count: size[name] }
    start += size[name]
  }
  return out
}

/** Where the last block ends: the length of the whole stream. */
const endOf = (blocks: Readonly<Record<Block, Range>>): number => blocks.topHeads.start + blocks.topHeads.count

/** A write cursor per block, each at its block's start. */
function cursorsOf(blocks: Readonly<Record<Block, Range>>): Record<Block, number> {
  return {
    lines: blocks.lines.start,
    topLines: blocks.topLines.start,
    heads: blocks.heads.start,
    topHeads: blocks.topHeads.start,
  }
}

export function tesselateBoard(board: BoardData, view: BoardView, omit: ReadonlySet<number>): Scene {
  const tops = topIds(board, view, omit)
  const drawn = board.pieces.filter((pc) => !omit.has(pc.id))

  // Two passes over the pieces, and pieceShape called in both. Once would need
  // the head's point count known in advance, and only pieceShape may decide
  // whether a head has three points or five — deriving it here again is exactly
  // the divergence geometry.ts exists to prevent.
  const counts = new Map<number, { line: number; head: number; corners: number; tail: number }>()
  const size: Record<Block, number> = { lines: 0, topLines: 0, heads: 0, topHeads: 0 }
  const discSize: Record<Block, number> = { lines: 0, topLines: 0, heads: 0, topHeads: 0 }
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const s = shapeOf(pc, view, top)
    const merged = mergeCollinear(s.line)
    const line = lineVerticesOf(merged)
    const head = headVertices(s.head.length, view.rounded)
    // A corner disc belongs to its piece's line block and the tail disc to its
    // head block: where the fans that drew them used to live.
    const corners = view.rounded ? cornersIn(merged) : 0
    const tail = view.rounded ? 1 : 0
    counts.set(pc.id, { line, head, corners, tail })
    size[top ? 'topLines' : 'lines'] += line
    size[top ? 'topHeads' : 'heads'] += head
    discSize[top ? 'topLines' : 'lines'] += corners
    discSize[top ? 'topHeads' : 'heads'] += tail
  }

  const blocks = layOut(size)
  const discBlocks = layOut(discSize)
  const positions = new Float32Array(endOf(blocks) * 2)
  const discs = new Float32Array(endOf(discBlocks) * FLOATS_PER_DISC)
  const cursor = cursorsOf(blocks)
  const discCursor = cursorsOf(discBlocks)
  const ranges = new Map<number, PieceRanges>()
  for (const pc of drawn) {
    const top = tops.has(pc.id)
    const c = counts.get(pc.id)
    if (!c) continue
    const s = shapeOf(pc, view, top)
    const half = strokeOf(view, top) / 2
    const lineBlock: Block = top ? 'topLines' : 'lines'
    const headBlock: Block = top ? 'topHeads' : 'heads'

    const merged = mergeCollinear(s.line)

    const lineStart = cursor[lineBlock]
    writeLine(positions, lineStart * 2, merged, half, view.rounded)
    cursor[lineBlock] = lineStart + c.line

    const headStart = cursor[headBlock]
    const headEnd = writeFan(positions, headStart * 2, s.head, 0, 0)
    if (!view.rounded) writeSquare(positions, headEnd, s.tail.x, s.tail.y, s.tail.r)
    cursor[headBlock] = headStart + c.head

    const cornerStart = discCursor[lineBlock]
    const tailStart = discCursor[headBlock]
    if (view.rounded) {
      writeCorners(discs, cornerStart * FLOATS_PER_DISC, merged, half)
      writeTailDisc(discs, tailStart * FLOATS_PER_DISC, s.tail.x, s.tail.y, s.tail.r)
    }
    discCursor[lineBlock] = cornerStart + c.corners
    discCursor[headBlock] = tailStart + c.tail

    ranges.set(pc.id, {
      line: { start: lineStart, count: c.line },
      head: { start: headStart, count: c.head },
      corners: { start: cornerStart, count: c.corners },
      tail: { start: tailStart, count: c.tail },
      top,
    })
  }

  return {
    positions,
    blocks,
    discs,
    discBlocks,
    cornerRadius: { lines: strokeOf(view, false) / 2, topLines: strokeOf(view, true) / 2 },
    rangeOf: (id) => ranges.get(id) ?? null,
    drawnIds: () => [...ranges.keys()],
  }
}

/** The diagnostic colours: four bytes a vertex, and four a disc. */
export interface SceneColors {
  vertices: Uint8Array
  discs: Uint8Array
}

/** Writes one opaque colour over every element of the ranges, four bytes each. */
function paint(bytes: Uint8Array, ranges: readonly Range[], rgb: readonly [number, number, number]): void {
  for (const range of ranges) {
    for (let i = 0; i < range.count; i++) {
      const o = (range.start + i) * 4
      bytes[o] = rgb[0]
      bytes[o + 1] = rgb[1]
      bytes[o + 2] = rgb[2]
      bytes[o + 3] = 255
    }
  }
}

/**
 * The colour of every vertex and every disc, for the diagnostic mode. Built
 * only when colours are switched on (see `GlResources.upload`), so a
 * monochrome board never allocates it.
 */
export function tesselateColors(scene: Scene): SceneColors {
  const vertices = new Uint8Array((scene.positions.length / 2) * 4)
  const discs = new Uint8Array((scene.discs.length / FLOATS_PER_DISC) * 4)
  for (const id of scene.drawnIds()) {
    const r = scene.rangeOf(id)
    if (!r) continue
    const rgb = hueBytes(id)
    paint(vertices, [r.line, r.head], rgb)
    paint(discs, [r.corners, r.tail], rgb)
  }
  return { vertices, discs }
}

/**
 * One piece's triangles and discs into caller-owned buffers, at rest or part
 * way down its own track. Never writes more than `rideVertexBound(piece)`
 * vertices or `rideDiscBound(piece)` discs.
 */
export function tesselatePiece(
  piece: Piece,
  view: BoardView,
  top: boolean,
  ride: Ride | null,
  out: Float32Array,
  discsOut: Float32Array,
): Written {
  const s = shapeOf(piece, view, top)
  const half = strokeOf(view, top) / 2
  const line = ride === null ? s.line : trackLine(piece.cells, ride.dir, ride.front, ride.shift)
  const merged = mergeCollinear(line)
  let o = writeLine(out, 0, merged, half, view.rounded)
  const d = ride === null ? { dx: 0, dy: 0 } : at(DIRS, ride.dir)
  const shift = ride === null ? 0 : ride.shift
  o = writeFan(out, o, s.head, d.dx * shift, d.dy * shift)
  const last = piece.cells.length - 1
  const [tx, ty] = ride === null ? [s.tail.x, s.tail.y] : trackPoint(piece.cells, ride.dir, last - shift)
  if (!view.rounded) o = writeSquare(out, o, tx, ty, s.tail.r)
  let q = 0
  if (view.rounded) {
    q = writeCorners(discsOut, q, merged, half)
    q = writeTailDisc(discsOut, q, tx, ty, s.tail.r)
  }
  return { vertices: o / 2, discs: q / FLOATS_PER_DISC }
}

/**
 * The cells the generator failed to carve, as two triangles per strip, in
 * cells: the geometry of the voids pass. The strips are static, so the layer
 * builds this once per board and never per frame.
 */
export function voidQuads(strips: readonly { x: number; y: number; len: number }[]): Float32Array {
  const data = new Float32Array(strips.length * 12)
  let o = 0
  for (const s of strips) {
    const x0 = s.x, y0 = s.y, x1 = s.x + s.len, y1 = s.y + 1
    data[o++] = x0
    data[o++] = y0
    data[o++] = x1
    data[o++] = y0
    data[o++] = x1
    data[o++] = y1
    data[o++] = x0
    data[o++] = y0
    data[o++] = x1
    data[o++] = y1
    data[o++] = x0
    data[o++] = y1
  }
  return data
}
