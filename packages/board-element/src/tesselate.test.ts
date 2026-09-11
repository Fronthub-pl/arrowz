import { defaultParams, generate, pieceShape } from '@arrowz/engine'
import type { Board, Piece } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { trackLine } from './track.ts'
import { DEFAULT_VIEW, hueBytes } from './view.ts'
import {
  FLOATS_PER_DISC,
  frontOf,
  type Range,
  rideDiscBound,
  rideVertexBound,
  type Scene,
  strokeOf,
  tesselateBoard,
  tesselateColors,
  tesselatePiece,
  voidQuads,
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
/** Head at (0,5) facing right, running straight: every interior point is collinear. */
const STRAIGHT: Piece = { id: 5, dir: 1, cells: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }] }
/** Head at (5,5) facing right, then down, then left: two corners and no straight run. */
const ZIGZAG: Piece = { id: 6, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 3, y: 6 }] }

const onlyPiece = (pc: Piece) => board(7, { pieces: [pc] })

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

const f32 = (n: number): number => Math.fround(n)

/** Every disc of a range, as [cx, cy, r] triples. */
function discsIn(discs: Float32Array, r: Range): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < r.count; i++) {
    const o = (r.start + i) * FLOATS_PER_DISC
    const cx = discs[o], cy = discs[o + 1], rad = discs[o + 2]
    if (cx === undefined || cy === undefined || rad === undefined) throw new Error('range runs past the discs')
    out.push([cx, cy, rad])
  }
  return out
}

/** The shape the tesselator draws a piece from, at the default view's widths. */
function shapeOf(pc: Piece) {
  return pieceShape(pc, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
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

test('a straight piece merges into one segment of six vertices', () => {
  const straight: Piece = { id: 1, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }] }
  const scene = tesselateBoard(board(7, { pieces: [straight] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(1)
  expect(r).not.toBeNull()
  // pieceShape emits one point per cell, so three collinear cells make two
  // points to merge into one segment: six vertices, not twelve.
  expect(r?.line.count).toBe(6)
})

test('the line is butt at both its outer ends; merging leaves no interior join to fill', () => {
  // Horizontal (dir 1, dx=1 dy=0), so world x alone pins position along the
  // line and the test needs no projection arithmetic.
  const straight: Piece = { id: 99, dir: 1, cells: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }] }
  const scene = tesselateBoard(board(7, { pieces: [straight] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(straight.id)
  if (!r) throw new Error('no range')
  const shape = pieceShape(straight, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
  const headX = at(shape.line, 0)[0]
  const tailX = at(shape.line, shape.line.length - 1)[0]
  const pts = points(scene.positions, r.line)
  const f32 = (n: number): number => Math.fround(n)
  const x = (i: number): number | undefined => pts[i]?.[0]
  // The piece's three cells are collinear, so mergeCollinear drops the middle
  // point before writeLine ever sees it: one segment spans headX to tailX,
  // and both its ends are the polyline's own outer ends — square, not pushed
  // out by half a stroke the way the butt cap of `toSvg` never is either.
  // There is no interior point left to extend a join from.
  expect(x(0)).toBe(f32(headX))
  expect(x(3)).toBe(f32(headX))
  expect(x(5)).toBe(f32(headX))
  expect(x(1)).toBe(f32(tailX))
  expect(x(2)).toBe(f32(tailX))
  expect(x(4)).toBe(f32(tailX))
})

test('a one-cell piece has no line segments and still has a head and a tail', () => {
  const scene = tesselateBoard(board(7, { pieces: [DOT] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(DOT.id)
  expect(r?.line.count).toBe(0)
  const shape = pieceShape(DOT, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
  // The head is its fan alone; the tail is a disc, not triangles.
  expect(r?.head.count).toBe(3 * (shape.head.length - 2))
  expect(r?.tail.count).toBe(1)
})

test('the head fan reproduces the polygon pieceShape describes', () => {
  const scene = tesselateBoard(board(7, { pieces: [BENT] }), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('no range')
  const shape = pieceShape(BENT, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
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
  const discs = new Float32Array(rideDiscBound(BENT) * FLOATS_PER_DISC)
  const w = tesselatePiece(BENT, view, false, { dir: BENT.dir, front, shift: 0.5 }, out, discs)
  const expected = trackLine(BENT.cells, BENT.dir, front, 0.5)
  const shape = pieceShape(BENT, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
  // The ride is written through the same writeLine, so it merges the same way.
  // `at` is this file's own checked index: the package allows no non-null assertions.
  const turnsAt = (l: readonly [number, number][], i: number): boolean => {
    const a = at(l, i - 1), b = at(l, i), c = at(l, i + 1)
    return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9
  }
  const corners = expected.filter((_, i) => i > 0 && i < expected.length - 1 && turnsAt(expected, i)).length
  const segments = corners + 1
  const want = 6 * segments + 3 * (shape.head.length - 2)
  expect(w.vertices).toBe(want)
  // One disc a corner, and the tail's.
  expect(w.discs).toBe(corners + 1)
  // The corner survives the ride: trackLine emits every cell centre still
  // between the two moving ends, so a bent piece never straightens. BENT has
  // four cells; the head is one cell tall, so the line begins 0.52 of a cell
  // behind the head centre, and at shift 0.5 the front end has not quite
  // reached that centre — it stops 0.02 short of it. The two ends are 0.02
  // behind cell 0's centre and between cells 2 and 3, leaving the centres of
  // cells 1 and 2 between them: two ends plus two centres is four points, and
  // the turn at cell 1 is one of them.
  expect(expected.length).toBe(4)
  expect(corners).toBe(1)
})

test('a ride never writes past either bound the layer allocates', () => {
  const view = DEFAULT_VIEW
  for (const pc of [BENT, ZIGZAG, STRAIGHT]) {
    const bound = rideVertexBound(pc)
    const discBound = rideDiscBound(pc)
    const out = new Float32Array(bound * 2)
    const discs = new Float32Array(discBound * FLOATS_PER_DISC)
    const front = frontOf(pc, view, false, pc.dir)
    for (const shift of [0, 0.01, 0.5, 1, 1.5, 2, 3, 3.99, 4, 10]) {
      const w = tesselatePiece(pc, view, false, { dir: pc.dir, front, shift }, out, discs)
      expect(w.vertices).toBeLessThanOrEqual(bound)
      expect(w.discs).toBeLessThanOrEqual(discBound)
    }
  }
})

test('the colour buffer carries hueBytes for every vertex of a piece', () => {
  const b = board(7, { pieces: [BENT] })
  const view = { ...DEFAULT_VIEW, colored: true }
  const scene = tesselateBoard(b, view, NONE)
  const colors = tesselateColors(scene).vertices
  expect(colors.length).toBe(scene.positions.length / 2 * 4)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('no range')
  const i = r.head.start * 4
  expect([colors[i], colors[i + 1], colors[i + 2]]).toEqual(hueBytes(BENT.id))
  expect(colors[i + 3]).toBe(255)
})

test('a corner costs one disc when rounded, and no triangles in either mode', () => {
  const sharp = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const round = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  // BENT turns once. Its segments are six vertices each in both modes; only
  // where they stop at the corner differs.
  expect(round.rangeOf(BENT.id)?.line.count).toBe(sharp.rangeOf(BENT.id)?.line.count)
  expect(round.rangeOf(BENT.id)?.corners.count).toBe(1)
  expect(sharp.rangeOf(BENT.id)?.corners.count).toBe(0)
})

test('a straight piece writes the same line in both modes', () => {
  const sharp = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const round = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(round.rangeOf(STRAIGHT.id)?.line.count).toBe(sharp.rangeOf(STRAIGHT.id)?.line.count)
})

test('both segments stop at a rounded corner, so nothing pokes out past its disc', () => {
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  // BENT turns at (4.5, 5.5) from running left to running down, so the outer
  // side of the turn is x < 4.5 and y < 5.5 at once. The disc covers that
  // quarter; a segment extended by half a stroke would reach into it with a
  // square corner the disc could never hide.
  const corner = at(BENT.cells, 1)
  const cx = corner.x + 0.5, cy = corner.y + 0.5
  const tol = 1e-6
  for (const [x, y] of points(scene.positions, r.line)) {
    expect(x < cx - tol && y < cy - tol).toBe(false)
  }
})

test('a sharp tail is a square with the same reach as the disc', () => {
  const round = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const sharp = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: false }, NONE)
  const headOf = (s: Scene) => s.rangeOf(BENT.id)?.head.count ?? 0
  // The square is two triangles in the head block; the disc is none, it is in the disc stream.
  expect(headOf(sharp) - headOf(round)).toBe(6)

  // Same reach: the switch changes the corner, never how much room a piece takes.
  const r = sharp.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  const half = DEFAULT_VIEW.stroke / 2
  const tail = at(BENT.cells, BENT.cells.length - 1)
  const cap = points(sharp.positions, r.head).slice(-6)
  const reach = cap.reduce((m, [x, y]) => Math.max(m, Math.abs(x - (tail.x + 0.5)), Math.abs(y - (tail.y + 0.5))), 0)
  expect(reach).toBeCloseTo(half, 9)
  const tailDisc = round.rangeOf(BENT.id)?.tail
  if (!tailDisc) throw new Error('no tail disc')
  expect(reach).toBeCloseTo(at(round.discs, tailDisc.start * FLOATS_PER_DISC + 2), 6)
})

test('a straight run costs one segment, not one per cell', () => {
  // STRAIGHT's line is three collinear points: two segments today, one after merging.
  const scene = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(scene.rangeOf(STRAIGHT.id)?.line.count).toBe(6)
})

test('merging leaves a piece with no straight run untouched', () => {
  // ZIGZAG turns at both interior points, so there is nothing to collapse.
  const scene = tesselateBoard(onlyPiece(ZIGZAG), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const shape = pieceShape(ZIGZAG, {
    cell: 1,
    pad: 0,
    width: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
  })
  expect(scene.rangeOf(ZIGZAG.id)?.line.count).toBe(6 * (shape.line.length - 1))
  expect(scene.rangeOf(ZIGZAG.id)?.corners.count).toBe(2)
})

test('BENT keeps its corner and loses its straight run', () => {
  // Its line is head base, (4.5,5.5), (4.5,6.5), (4.5,7.5): one turn, then two
  // collinear points that merge into one segment. Two segments and one corner disc.
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(scene.rangeOf(BENT.id)?.line.count).toBe(6 * 2)
  expect(scene.rangeOf(BENT.id)?.corners.count).toBe(1)
})

test('a rounded piece carries a disc on its corner and one on its tail', () => {
  const scene = tesselateBoard(onlyPiece(BENT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  // BENT turns once, at cells[1]; its straight run merges away and adds no disc.
  expect(r.corners.count).toBe(1)
  expect(r.tail.count).toBe(1)
  // A round join is a whole disc of radius half the stroke, on the vertex.
  const corner = at(BENT.cells, 1)
  expect(discsIn(scene.discs, r.corners)).toEqual([[
    f32(corner.x + 0.5),
    f32(corner.y + 0.5),
    f32(DEFAULT_VIEW.stroke / 2),
  ]])
  const s = shapeOf(BENT)
  expect(discsIn(scene.discs, r.tail)).toEqual([[f32(s.tail.x), f32(s.tail.y), f32(s.tail.r)]])
})

test('a straight piece has only its tail disc, and a sharp piece has none', () => {
  const round = tesselateBoard(onlyPiece(STRAIGHT), { ...DEFAULT_VIEW, rounded: true }, NONE)
  expect(round.rangeOf(STRAIGHT.id)?.corners.count).toBe(0)
  expect(round.rangeOf(STRAIGHT.id)?.tail.count).toBe(1)
  const sharp = tesselateBoard(onlyPiece(ZIGZAG), { ...DEFAULT_VIEW, rounded: false }, NONE)
  expect(sharp.discs.length).toBe(0)
  expect(sharp.rangeOf(ZIGZAG.id)?.corners.count).toBe(0)
  expect(sharp.rangeOf(ZIGZAG.id)?.tail.count).toBe(0)
})

test('the four disc blocks tile the disc buffer, and every piece sits inside its own', () => {
  const scene = tesselateBoard(board(), { ...DEFAULT_VIEW, top: 3 }, NONE)
  const order = ['lines', 'topLines', 'heads', 'topHeads'] as const
  let n = 0
  for (const name of order) {
    expect(scene.discBlocks[name].start).toBe(n)
    n += scene.discBlocks[name].count
  }
  expect(scene.discs.length).toBe(n * FLOATS_PER_DISC)
  const inside = (r: Range, block: Range): boolean =>
    r.start >= block.start && r.start + r.count <= block.start + block.count
  for (const id of scene.drawnIds()) {
    const r = scene.rangeOf(id)
    if (!r) throw new Error(`piece ${id} has no range`)
    expect(inside(r.corners, scene.discBlocks[r.top ? 'topLines' : 'lines'])).toBe(true)
    expect(inside(r.tail, scene.discBlocks[r.top ? 'topHeads' : 'heads'])).toBe(true)
  }
})

test("zeroing one piece's discs leaves its neighbours' discs byte for byte", () => {
  const b = board()
  const scene = tesselateBoard(b, DEFAULT_VIEW, NONE)
  const [victim, witness] = [b.pieces[1], b.pieces[2]]
  if (!victim || !witness) throw new Error('need three pieces')
  const vr = scene.rangeOf(victim.id)
  const wr = scene.rangeOf(witness.id)
  if (!vr || !wr) throw new Error('no ranges')
  const before = [...discsIn(scene.discs, wr.corners), ...discsIn(scene.discs, wr.tail)]
  for (const range of [vr.corners, vr.tail]) {
    scene.discs.fill(0, range.start * FLOATS_PER_DISC, (range.start + range.count) * FLOATS_PER_DISC)
  }
  expect([...discsIn(scene.discs, wr.corners), ...discsIn(scene.discs, wr.tail)]).toEqual(before)
})

test('the colour streams carry hueBytes for every disc of a piece too', () => {
  const scene = tesselateBoard(board(7, { pieces: [BENT] }), { ...DEFAULT_VIEW, colored: true }, NONE)
  const colors = tesselateColors(scene)
  expect(colors.discs.length).toBe((scene.discs.length / FLOATS_PER_DISC) * 4)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('no range')
  for (const range of [r.corners, r.tail]) {
    const i = range.start * 4
    expect(Array.from(colors.discs.subarray(i, i + 4))).toEqual([...hueBytes(BENT.id), 255])
  }
})

test('a piece at rest writes the discs the board holds for it, corners then tail', () => {
  const scene = tesselateBoard(onlyPiece(BENT), DEFAULT_VIEW, NONE)
  const r = scene.rangeOf(BENT.id)
  if (!r) throw new Error('BENT is not drawn')
  const out = new Float32Array(rideVertexBound(BENT) * 2)
  const discs = new Float32Array(rideDiscBound(BENT) * FLOATS_PER_DISC)
  const w = tesselatePiece(BENT, DEFAULT_VIEW, false, null, out, discs)
  expect(discsIn(discs, { start: 0, count: w.discs })).toEqual([
    ...discsIn(scene.discs, r.corners),
    ...discsIn(scene.discs, r.tail),
  ])
})

test('the scene knows the radius of every corner disc in each line block', () => {
  const view = { ...DEFAULT_VIEW, top: 2 }
  const scene = tesselateBoard(board(), view, NONE)
  // Half the stroke each block is drawn with: highlighted pieces are thicker.
  expect(scene.cornerRadius.lines).toBe(strokeOf(view, false) / 2)
  expect(scene.cornerRadius.topLines).toBe(strokeOf(view, true) / 2)
})

test('voidQuads is empty when there are no strips', () => {
  expect(voidQuads([])).toEqual(new Float32Array(0))
})

test('voidQuads covers a strip with two triangles, in cells', () => {
  // Three cells from (2,5): x runs 2 to 5, y runs 5 to 6.
  expect(Array.from(voidQuads([{ x: 2, y: 5, len: 3 }]))).toEqual([2, 5, 5, 5, 5, 6, 2, 5, 5, 6, 2, 6])
})

test('voidQuads puts strips back to back, twelve floats each', () => {
  const q = voidQuads([{ x: 0, y: 0, len: 1 }, { x: 4, y: 2, len: 2 }])
  expect(q.length).toBe(24)
  expect(Array.from(q.subarray(12))).toEqual([4, 2, 6, 2, 6, 3, 4, 2, 6, 3, 4, 3])
})
