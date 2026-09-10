import { defaultParams, generate, voidStrips } from '@arrowz/engine'
import type { Board, Cell, Piece } from '@arrowz/engine'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { GlLayer } from './gl-layer.ts'
import { DEFAULT_VIEW } from './view.ts'
import { fit, MIN_POINT_CELL_PX } from './viewport.ts'

const HOST = 200

function board(seed = 7): Board {
  return generate({ ...defaultParams(), W: 30, H: 30, seed }).board
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

let layer: GlLayer
beforeEach(() => {
  document.body.innerHTML = ''
  layer = new GlLayer()
  layer.canvas.style.width = `${HOST}px`
  layer.canvas.style.height = `${HOST}px`
  document.body.append(layer.canvas)
})

/** Every context this file opens must close: browsers cap live WebGL contexts. */
afterEach(() => {
  layer.dispose()
})

/** The layer schedules on rAF; two frames guarantee the draw has happened. */
async function drawn(): Promise<void> {
  await frame()
  await frame()
}

/** One pixel of the canvas, as [r, g, b, a] bytes read back from the GPU. */
function pixel(x: number, y: number): [number, number, number, number] {
  const gl = layer.canvas.getContext('webgl2')
  if (!gl) throw new Error('no webgl2')
  const buf = new Uint8Array(4)
  // readPixels counts from the bottom left; the viewport maths counts from the top.
  gl.readPixels(x, gl.drawingBufferHeight - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
  const [r, g, b, a] = buf
  if (r === undefined || g === undefined || b === undefined || a === undefined) throw new Error('short read')
  return [r, g, b, a]
}

/**
 * One pixel as the page behind the canvas sees it, over a grey `page` level.
 *
 * The drawing buffer is premultiplied, so what lands on screen is the buffer's
 * own colour plus whatever shows through the alpha it did not write. A pass
 * that composites straight alpha into a premultiplied buffer gets the colour
 * channels right and the alpha channel wrong, which a raw `pixel()` read
 * cannot tell from correct — and which washes the pixel out here.
 */
function composited(x: number, y: number, page: number): [number, number, number] {
  const [r, g, b, a] = pixel(x, y)
  const through = page * (1 - a / 255)
  const over = (c: number): number => Math.min(255, Math.round(c + through))
  return [over(r), over(g), over(b)]
}

/** The middle of the drawing buffer, whatever the device pixel ratio is. */
function centre(): [number, number, number, number] {
  return pixel(Math.floor(layer.canvas.width / 2), Math.floor(layer.canvas.height / 2))
}

/**
 * Every byte of the drawing buffer. A single-pixel sample is not reliable
 * here: `board()` is 30x30 and `HOST` is 200, so the fitted viewport's centre
 * lands exactly on the board's own centre (15, 15) — a seam between two
 * half-cell-wide strokes, not inside either one — and scaling by an exact
 * integer factor around an origin of (0, 0) maps that seam onto another seam
 * (3.75, 3.75) on the next read. Both are paper by construction, for any
 * board this generator can produce, which would make a one-pixel comparison
 * pass or fail on the geometry of the grid rather than on whether the layer
 * redrew. Reading the whole buffer keeps the same assertion — the picture
 * changed — without depending on one coordinate's luck.
 */
function snapshot(): Uint8Array {
  const gl = layer.canvas.getContext('webgl2')
  if (!gl) throw new Error('no webgl2')
  const buf = new Uint8Array(layer.canvas.width * layer.canvas.height * 4)
  gl.readPixels(0, 0, layer.canvas.width, layer.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf)
  return buf
}

/**
 * How many pixels of the drawing buffer are dark. Used with white paper and
 * black ink, so it counts the pieces and nothing else: the margin outside the
 * paper is transparent, which is dark in the red channel but has no alpha.
 */
function inked(): number {
  const buf = snapshot()
  let n = 0
  for (let i = 0; i < buf.length; i += 4) {
    const [r, g, b, a] = [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0, buf[i + 3] ?? 0]
    if (a > 0 && r < 100 && g < 100 && b < 100) n++
  }
  return n
}

/**
 * How much ink the drawing buffer holds: how far every pixel that was painted
 * at all is from white. Used with half transparent ink, where a shape drawn
 * twice composites twice and comes out measurably darker than the same shape
 * drawn once — which a single-pixel or an inked() count could not tell apart.
 */
function darkness(): number {
  const buf = snapshot()
  let sum = 0
  for (let i = 0; i < buf.length; i += 4) {
    if ((buf[i + 3] ?? 0) > 0) sum += 255 - (buf[i] ?? 0)
  }
  return sum
}

function show(b: Board | null, view = DEFAULT_VIEW): void {
  layer.setBoard(b, view)
  layer.setViewport(fit({ W: b?.W ?? 1, H: b?.H ?? 1, hostWidth: HOST, hostHeight: HOST, pad: 0 }))
}

test('WebGL2 is available in this browser, so the rest of the file means something', () => {
  expect(layer.supported).toBe(true)
})

test('a board draws: the middle of the canvas is not the page behind it', () => {
  show(board())
  layer.drawNowForTest()
  const [r, g, b, a] = centre()
  expect(a).toBe(255)
  expect([r, g, b]).not.toEqual([0, 0, 0])
})

test('the paper is the colour the view asks for', () => {
  // ink and paper differ, so a green read only proves something: the centre
  // pixel could be either colour depending on the board, but the corner
  // cannot — it samples deep in the margin, cells away from where any piece
  // could reach, wide enough (pad 10 against a ~2.9-cell fitted margin) that
  // the paper quad is guaranteed to cover it.
  const b = board()
  layer.setBoard(b, { ...DEFAULT_VIEW, paper: '#00ff00', ink: '#ff00ff' })
  layer.pad = 10
  layer.setViewport(fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 2 }))
  layer.drawNowForTest()
  const [red, green, blue] = pixel(0, 0)
  expect([red, green, blue]).toEqual([0, 255, 0])
})

test('a board of no pieces still paints its paper, and one of null paints nothing', () => {
  show({ ...board(), pieces: [] }, { ...DEFAULT_VIEW, paper: '#ff0000' })
  layer.drawNowForTest()
  expect(centre()[0]).toBe(255)
  show(null)
  layer.drawNowForTest()
  expect(centre()[3]).toBe(0)
})

test('the layer counts the pieces it drew, omissions excluded', () => {
  const b = board()
  const gone = b.pieces[0]
  if (!gone) throw new Error('need a piece')
  layer.setBoard(b, DEFAULT_VIEW, new Set([gone.id]))
  expect(layer.pieceCount).toBe(b.pieces.length - 1)
  expect(layer.hasPiece(gone.id)).toBe(false)
  expect(layer.hasPiece(b.pieces[1]?.id ?? -1)).toBe(true)
})

test('panning changes the picture without touching the board', () => {
  const b = board()
  show(b)
  layer.drawNowForTest()
  const before = snapshot()
  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  layer.setViewport({ ...v, cellPx: v.cellPx * 4 })
  layer.drawNowForTest()
  expect(snapshot()).not.toEqual(before)
  expect(layer.pieceCount).toBe(b.pieces.length)
})

test('several viewport changes inside one frame cost one draw', async () => {
  show(board())
  await drawn()
  const before = layer.drawsForTest
  const v = fit({ W: 30, H: 30, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  layer.setViewport({ ...v, cellPx: v.cellPx * 1.1 })
  layer.setViewport({ ...v, cellPx: v.cellPx * 1.2 })
  layer.setViewport({ ...v, cellPx: v.cellPx * 1.3 })
  await drawn()
  expect(layer.drawsForTest).toBe(before + 1)
})

test('a pan re-stating the same point settings costs the pan and nothing else', async () => {
  const b = board()
  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  show(b)
  layer.setPoints(true, '#ff0000', 0.12)
  await drawn()
  const before = layer.drawsForTest

  // The element hands the layer all three point settings on every viewport
  // change, because only it knows whether `cellPx` has crossed
  // MIN_POINT_CELL_PX (arrowz-board.ts, `updatePoints`). Each viewport below
  // legitimately costs its own frame; the settings that come with it have not
  // moved and must cost none — which is also what keeps `rgbaOf`, a
  // `getImageData` readback, out of the frames of a pan. They are re-stated
  // on a frame of their own here, because inside the viewport's frame a
  // second `schedule()` would be free whether it was wanted or not.
  for (const factor of [1.1, 1.2, 1.3]) {
    layer.setViewport({ ...v, cellPx: v.cellPx * factor })
    await drawn()
    layer.setPoints(true, '#ff0000', 0.12)
    await drawn()
  }
  expect(layer.drawsForTest).toBe(before + 3)

  // A guard, not a mute: a colour that did move still repaints the grid.
  layer.setPoints(true, '#00ff00', 0.12)
  await drawn()
  expect(layer.drawsForTest).toBe(before + 4)
})

/**
 * How many pixels in the row through the first dot's centre are the dot
 * colour. The row is derived from `cellPx` and `devicePixelRatio` rather than
 * guessed: a dot sits at world (0.5, 0.5) with origin (0, 0), so its centre
 * lands at `0.5 * cellPx * devicePixelRatio` device pixels down — not at some
 * fixed row that only happens to be right at one zoom. The scan spans six
 * cell pitches, wide enough to cross several dots, capped to the canvas.
 */
function redDots(cellPx: number): number {
  const dpr = devicePixelRatio
  const y = Math.round(0.5 * cellPx * dpr)
  const span = Math.min(layer.canvas.width, Math.round(cellPx * dpr * 6))
  let n = 0
  for (let x = 0; x < span; x++) {
    const [r, g, b] = pixel(x, y)
    if (r > 200 && g < 80 && b < 80) n++
  }
  return n
}

test('the point grid appears only once a cell is big enough to hold a dot', () => {
  const b = { ...board(), pieces: [] }
  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  layer.setBoard(b, { ...DEFAULT_VIEW, paper: '#ffffff' })
  layer.setPoints(true, '#ff0000', 0.12)

  // Below the threshold the grid must not draw at all: a dense raster of dots
  // moirés instead of reading as dots.
  const denseCellPx = MIN_POINT_CELL_PX - 1
  layer.setViewport({ ...v, cellPx: denseCellPx, originX: 0, originY: 0 })
  layer.drawNowForTest()
  const dense = redDots(denseCellPx)

  const zoomedCellPx = MIN_POINT_CELL_PX * 4
  layer.setViewport({ ...v, cellPx: zoomedCellPx, originX: 0, originY: 0 })
  layer.drawNowForTest()
  expect(redDots(zoomedCellPx)).toBeGreaterThan(dense)
  expect(dense).toBe(0)
})

test('the voids draw the highlight colour, at .22 opacity, over cells the generator left empty', () => {
  // seed 7 on a 30x30 board happens to leave voidStrips() empty, so the test
  // cannot rely on the generator to produce any: it carves its own run of
  // empty cells into a copy of the owner grid — the only thing voidStrips()
  // reads (see packages/engine/geometry.ts) — and asserts on that fixture
  // directly, so the test cannot silently start exercising nothing again.
  const base = board()
  const owner = Int32Array.from(base.owner)
  const runLen = 4
  for (let x = 0; x < runLen; x++) owner[x] = -1
  const b: Board = { ...base, owner, pieces: [] }
  const strips = voidStrips(b)
  expect(strips.length).toBeGreaterThan(0)

  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  layer.setViewport({ ...v, originX: 0, originY: 0 })
  // The centre of the carved run's first cell, in device pixels off an
  // origin of (0, 0) — computed the way redDots() computes its row, not guessed.
  const dpr = devicePixelRatio
  const px = Math.round(0.5 * v.cellPx * dpr)
  const py = Math.round(0.5 * v.cellPx * dpr)

  // The view's own two colours, so the arithmetic below is the one a board
  // actually performs: paper #f6f6fa is (246, 246, 250) and highlight #e8467c
  // is (232, 70, 124).
  const paper = DEFAULT_VIEW.paper
  layer.setBoard(b, { ...DEFAULT_VIEW, voids: false, ink: paper })
  layer.drawNowForTest()
  expect(layer.voidCountForTest).toBe(0)
  expect(pixel(px, py)).toEqual([246, 246, 250, 255])

  layer.setBoard(b, { ...DEFAULT_VIEW, voids: true, ink: paper })
  layer.drawNowForTest()
  expect(layer.voidCountForTest).toBe(strips.length)

  // The alpha is half the assertion, and the half that was missing. The pass
  // covers opaque paper, so whatever it does to the colour it must leave the
  // pixel opaque: `src.a + dst.a * (1 - src.a)` is .22 + .78 = 1. Blending
  // straight alpha into the premultiplied buffer left .22 * .22 + .78 = .83
  // instead, and the compositor read the sixth of the pixel that was missing
  // as a hole and let the white page through it.
  expect(pixel(px, py)[3]).toBe(255)
  // The highlight at the .22 fill-opacity the SVG group carried, over the
  // paper, computed rather than recorded: 232*.22 + 246*.78 = 242.92 for red,
  // 70*.22 + 246*.78 = 207.28 for green, 124*.22 + 250*.78 = 222.28 for blue.
  // Over a white page it stays exactly that, because nothing shows through.
  expect(composited(px, py, 255)).toEqual([243, 207, 222])
})

test('an exit removes the piece and resolves', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  expect(layer.hasPiece(pc.id)).toBe(true)
  await layer.animateExit(pc.id, pc.dir)
  expect(layer.hasPiece(pc.id)).toBe(false)
  expect(layer.isExiting(pc.id)).toBe(false)
  expect(layer.pieceCount).toBe(b.pieces.length - 1)
})

test('a piece on its way out is marked while it rides', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  const done = layer.animateExit(pc.id, pc.dir)
  expect(layer.isExiting(pc.id)).toBe(true)
  await done
  expect(layer.isExiting(pc.id)).toBe(false)
})

test('a shake leaves the piece where it started', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  await layer.shake(pc.id, 0.3)
  expect(layer.hasPiece(pc.id)).toBe(true)
  expect(layer.pieceCount).toBe(b.pieces.length)
})

test('an exit on a piece that is not there resolves without drawing', async () => {
  show(board())
  await drawn()
  await expect(layer.animateExit(-1, 1)).resolves.toBeUndefined()
})

test('a second ride supersedes the first without leaving the piece behind', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  const first = layer.shake(pc.id, 0.3)
  const second = layer.animateExit(pc.id, pc.dir)
  await Promise.all([first, second])
  expect(layer.hasPiece(pc.id)).toBe(false)
})

test('a bad direction throws and leaves the piece exactly as it was', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  layer.drawNowForTest()
  const before = snapshot()
  expect(() => layer.animateExit(pc.id, 9)).toThrow()
  expect(layer.isExiting(pc.id)).toBe(false)
  expect(layer.hasPiece(pc.id)).toBe(true)
  await drawn()
  layer.drawNowForTest()
  expect(snapshot()).toEqual(before)
})

test('a ride draws a frame of its own while it runs', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  const solo: Board = { ...b, pieces: [pc] }
  show(solo, { ...DEFAULT_VIEW, paper: '#ffffff', ink: '#000000' })
  // Two frames before the ride starts, which warms the clock as well: a ride
  // handed a stale start time settles on its first tick, and the mid-ride
  // frame this test is about would never happen.
  await drawn()
  layer.drawNowForTest()
  const rest = snapshot()
  const before = layer.drawsForTest
  const ride = layer.shake(pc.id, 3)
  await drawn()
  layer.drawNowForTest()
  // The picture, not the count: the settling schedules a frame of its own, so
  // a ride that never drew a thing would still move `drawsForTest`. The piece
  // has to be somewhere else and still be there — moved, because the line
  // bends through the corners while the head runs straight out and no
  // interpolated transform can express that; still drawn, because a ride that
  // only collapsed it would move the picture too.
  expect(snapshot()).not.toEqual(rest)
  expect(inked()).toBeGreaterThan(0)
  expect(layer.drawsForTest).toBeGreaterThan(before)
  await ride
})

test('a second exit supersedes the first and the piece stays exiting until the second ends', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  const first = layer.animateExit(pc.id, pc.dir)
  const second = layer.animateExit(pc.id, pc.dir)
  expect(layer.isExiting(pc.id)).toBe(true)
  await expect(first).resolves.toBeUndefined()
  // Only the exit that owns the mark may clear it: the first one lost the
  // piece to the second, which is still carrying it off the board.
  expect(layer.isExiting(pc.id)).toBe(true)
  await expect(second).resolves.toBeUndefined()
  expect(layer.isExiting(pc.id)).toBe(false)
  expect(layer.hasPiece(pc.id)).toBe(false)
})

test('a new board cancels a ride in flight, and the piece it rode is not dropped from the new one', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  const p = layer.animateExit(pc.id, pc.dir)
  const next = board(8)
  show(next)
  // The mark goes with the ride, at once: a ride left running would carry on
  // over the new board and take a piece of it off when it ended.
  expect(layer.isExiting(pc.id)).toBe(false)
  await expect(p).resolves.toBeUndefined()
  expect(layer.pieceCount).toBe(next.pieces.length)
  expect(layer.hasPiece(pc.id)).toBe(true)
})

test('a changed view cancels a ride in flight and its promise still resolves', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  const p = layer.animateExit(pc.id, pc.dir)
  // A changed view rebuilds the scene, ranges and all, so a ride left running
  // would have nothing left to write its piece back into.
  layer.setBoard(b, { ...DEFAULT_VIEW, stroke: 0.3 })
  expect(layer.isExiting(pc.id)).toBe(false)
  await expect(p).resolves.toBeUndefined()
  expect(layer.hasPiece(pc.id)).toBe(true)
  expect(layer.pieceCount).toBe(b.pieces.length)
})

test('disposing cancels a ride in flight and its promise still resolves', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  await drawn()
  const p = layer.animateExit(pc.id, pc.dir)
  expect(layer.isExiting(pc.id)).toBe(true)
  layer.dispose()
  // Nothing is left in flight the moment the layer gives its buffers back;
  // `afterEach` disposing a second time must find nothing to do either.
  expect(layer.isExiting(pc.id)).toBe(false)
  await expect(p).resolves.toBeUndefined()
})

test('a shake leaves the picture exactly as it found it', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  show(b)
  layer.drawNowForTest()
  const before = snapshot()
  await layer.shake(pc.id, 0.3)
  layer.drawNowForTest()
  // Byte for byte: the piece's triangles are written back from the scene, so a
  // rider left in the buffer or a range left collapsed would both show here.
  expect(snapshot()).toEqual(before)
})

test('a riding piece is drawn once: the static buffer lets go of it', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  // One piece alone, in half transparent ink: the resting picture and the
  // riding picture are the same shape, so the only thing that can darken the
  // canvas is the static buffer drawing the piece the rider is already drawing.
  const solo: Board = { ...b, pieces: [pc] }
  show(solo, { ...DEFAULT_VIEW, paper: '#ffffff', ink: 'rgba(0, 0, 0, 0.5)' })
  // The frame clock has to be warm before the ride starts. `document.timeline`
  // only moves when a frame is produced, and a ride begun after a gap between
  // frames — the previous test's teardown is one — is handed a start time that
  // old, so it is already past its duration on its first tick and settles at
  // once. The piece would be back at rest before the picture below is read.
  await drawn()
  layer.drawNowForTest()
  const rest = darkness()
  expect(rest).toBeGreaterThan(0)
  // A shake of no distance rides the piece to exactly where it already is.
  const ride = layer.shake(pc.id, 0)
  await drawn()
  layer.drawNowForTest()
  const riding = darkness()
  await ride
  expect(riding).toBeGreaterThan(rest * 0.95)
  expect(riding).toBeLessThan(rest * 1.05)
})

test('two pieces can ride at once, each drawn once', async () => {
  const b = board()
  const [one, two] = [b.pieces[0], b.pieces[1]]
  if (!one || !two) throw new Error('need two pieces')
  // Two quick clicks are all it takes for two rides to overlap, and the rider
  // buffer holds them both: a buffer holding only whichever uploaded last
  // would leave the other piece out of the frame, which is half the ink.
  const pair: Board = { ...b, pieces: [one, two] }
  show(pair, { ...DEFAULT_VIEW, paper: '#ffffff', ink: 'rgba(0, 0, 0, 0.5)' })
  await drawn()
  layer.drawNowForTest()
  const rest = darkness()
  const rides = [layer.shake(one.id, 0), layer.shake(two.id, 0)]
  await drawn()
  layer.drawNowForTest()
  const riding = darkness()
  await Promise.all(rides)
  expect(riding).toBeGreaterThan(rest * 0.95)
  expect(riding).toBeLessThan(rest * 1.05)
})

test('a piece that has ridden out leaves no ink behind', async () => {
  const b = board()
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  // One piece alone, so every inked pixel on the canvas is that piece: with
  // the rest of the board drawn there would be nothing to count.
  const solo: Board = { ...b, pieces: [pc] }
  show(solo, { ...DEFAULT_VIEW, paper: '#ffffff', ink: '#000000' })
  layer.drawNowForTest()
  expect(inked()).toBeGreaterThan(0)
  await layer.animateExit(pc.id, pc.dir)
  layer.drawNowForTest()
  expect(inked()).toBe(0)
})

test('a lost context is taken back and the board is drawn again', async () => {
  const b = board()
  const [gone, pc] = [b.pieces[0], b.pieces[1]]
  if (!gone || !pc) throw new Error('need two pieces')
  show(b, { ...DEFAULT_VIEW, paper: '#ffffff', ink: '#000000' })
  await drawn()
  // A piece dropped before the loss must still be gone after the restore.
  await layer.animateExit(gone.id, gone.dir)
  layer.drawNowForTest()
  expect(layer.hasPiece(gone.id)).toBe(false)
  expect(inked()).toBeGreaterThan(0)

  const gl = layer.canvas.getContext('webgl2')
  const lose = gl?.getExtension('WEBGL_lose_context')
  if (!lose) throw new Error('WEBGL_lose_context is needed for this test')

  lose.loseContext()
  await drawn()
  expect(layer.supported).toBe(false)

  lose.restoreContext()
  // The restore event is asynchronous; give it a few frames to arrive.
  for (let i = 0; i < 10 && !layer.supported; i++) await frame()
  expect(layer.supported).toBe(true)
  await drawn()
  layer.drawNowForTest()

  // Not byte-identical to before the loss: MSAA sample positions are not
  // contractually stable across two different GL contexts, so this checks
  // that the board is drawn again and the piece count survived, rather than
  // that the pixels match the earlier context exactly.
  expect(inked()).toBeGreaterThan(0)
  expect(layer.pieceCount).toBe(b.pieces.length - 1)
  expect(layer.hasPiece(gone.id)).toBe(false)
  expect(layer.hasPiece(pc.id)).toBe(true)
})

/** A board of one two-cell piece, its head in the last column and pointing off it. */
function edgeBoard(W: number, H: number): Board {
  const owner = new Int32Array(W * H).fill(-1)
  const row = Math.floor(H / 2)
  owner[row * W + (W - 1)] = 0
  owner[row * W + (W - 2)] = 0
  return {
    W,
    H,
    owner,
    pieces: [{ id: 0, dir: 1, cells: [{ x: W - 1, y: row }, { x: W - 2, y: row }] }],
    stats: { want: 1, got: 1, stall: 0, strandTrunc: 0, strandLoss: 0, n: 1 },
    backtracks: 0,
    remaining: 0,
  }
}

/** The rightmost device column of a row that holds ink, or -1 for a row with none. */
function rightmostInk(y: number): number {
  let last = -1
  for (let x = 0; x < layer.canvas.width; x++) {
    const [r, g, b, a] = pixel(x, y)
    if (a > 0 && r < 100 && g < 100 && b < 100) last = x
  }
  return last
}

/**
 * A board of one straight, `length`-cell piece well short of the edge it
 * faces, sized so the ride it takes to clear the board runs close to
 * `EXIT_MAX_MS` and stays clipped, part of the piece still inside the paper,
 * for most of that time.
 *
 * Both properties matter to the frame-sampling test below, and neither comes
 * from a short piece hugging the edge: `exitDistance` is `toEdge + length +
 * 1`, so a piece already at the edge gives the shortest possible distance
 * and `exitMs` clamps its ride to `EXIT_MIN_MS` — over in a frame or two, and
 * liable to finish between two samples entirely when the browser is busy
 * enough to space frames out. Placing the piece `toEdge` cells back stretches
 * the ride toward `EXIT_MAX_MS` instead, and lengthening the piece stretches
 * the clipped part of it: what stays visible, part in and part out of the
 * paper, is `length + 1` of those cells, so a longer piece keeps some ink on
 * screen — the thing this test samples for — over a much bigger share of the
 * ride than a short one does.
 */
function farBoard(W: number, H: number, length: number): Board {
  const owner = new Int32Array(W * H).fill(-1)
  const row = Math.floor(H / 2)
  const head = length - 1
  const cells: Cell[] = []
  for (let x = head; x >= 0; x--) {
    owner[row * W + x] = 0
    cells.push({ x, y: row })
  }
  return {
    W,
    H,
    owner,
    pieces: [{ id: 0, dir: 1, cells }],
    stats: { want: 1, got: 1, stall: 0, strandTrunc: 0, strandLoss: 0, n: 1 },
    backtracks: 0,
    remaining: 0,
  }
}

test('a rider is clipped at the paper, margin and all, and never past it', async () => {
  // The paper keeps a quarter cell of margin while the view keeps three, so
  // there is bare canvas beyond the paper for an unclipped rider to reach —
  // and the quarter cell is narrow enough that a ride crosses it in a frame,
  // which is what makes the clip's own edge, rather than the board's, the
  // thing under test.
  const pad = 0.25
  const b = farBoard(17, 3, 12)
  const pc = b.pieces[0]
  if (!pc) throw new Error('need a piece')
  const v = fit({ W: b.W, H: b.H, hostWidth: HOST, hostHeight: HOST, pad: 3 })
  layer.setBoard(b, { ...DEFAULT_VIEW, paper: '#ffffff', ink: '#000000' })
  layer.pad = pad
  layer.setViewport(v)
  await drawn()
  layer.drawNowForTest()

  const dpr = devicePixelRatio
  const row = Math.round((Math.floor(b.H / 2) + 0.5 - v.originY) * v.cellPx * dpr)
  const boardEdge = (b.W - v.originX) * v.cellPx * dpr
  const paperEdge = Math.round((b.W + pad - v.originX) * v.cellPx * dpr)
  // At rest the piece sits well inside the board, short of its own edge.
  expect(rightmostInk(row)).toBeLessThanOrEqual(Math.ceil(boardEdge))

  // Sampled every frame for as long as the ride itself runs, not for a fixed
  // handful of frames: a fixed count can run out before the ride does when
  // frames are spaced out, which is exactly the flake this replaces. Only the
  // frames that actually caught ink feed the measurement — a frame that
  // caught none says nothing about where the clip sits.
  const ride = layer.animateExit(pc.id, pc.dir)
  let settled = false
  void ride.then(() => {
    settled = true
  })
  let furthest = -1
  let seen = 0
  for (let i = 0; i < 300 && !settled; i++) {
    await frame()
    layer.drawNowForTest()
    const x = rightmostInk(row)
    if (x !== -1) furthest = Math.max(furthest, x)
    seen = Math.max(seen, inked())
  }
  await ride

  // The real failure, named: no sampled frame caught the rider at all, so
  // there is nothing to assert the clip against.
  if (furthest === -1) throw new Error('the ride finished before any frame could be sampled')

  // It rode into the margin, so the clip is not the board's edge...
  expect(furthest).toBeGreaterThan(boardEdge)
  // ...and no further, though the ride carries it cells past the paper.
  expect(furthest).toBeLessThanOrEqual(paperEdge)
  // The clip takes the part that left the paper, never the piece: the rider
  // was on the canvas throughout.
  expect(seen).toBeGreaterThan(0)
})

test('a monochrome board allocates no colour buffer, and the first colouring builds one that stays', () => {
  const b = board()
  show(b)
  layer.drawNowForTest()
  // Spec §8: the colour buffer is the diagnostic mode's alone, and it is what
  // the ceiling case's 47.7 MB rather than 73 MB rests on.
  expect(layer.hasColorsForTest).toBe(false)

  layer.setBoard(b, { ...DEFAULT_VIEW, colored: true })
  layer.drawNowForTest()
  expect(layer.hasColorsForTest).toBe(true)

  // Built once and kept: going back to monochrome is a uniform, not a rebuild.
  layer.setBoard(b, DEFAULT_VIEW)
  layer.drawNowForTest()
  expect(layer.hasColorsForTest).toBe(true)
})

test('the dot grid is drawn under the pieces, not over them', () => {
  // One piece, at a known cell, with dots big enough to swallow it: at the
  // head's own centre the grid and the piece want the same pixel, so the
  // pixel says which of the two was drawn last.
  const b = edgeBoard(30, 30)
  const piece: Piece = { id: 0, dir: 1, cells: [{ x: 2, y: 2 }, { x: 1, y: 2 }] }
  layer.setBoard({ ...b, pieces: [piece] }, { ...DEFAULT_VIEW, paper: '#ffffff', ink: '#000000' })
  layer.setPoints(true, '#ff0000', 0.45)
  const v = fit({ W: 30, H: 30, hostWidth: HOST, hostHeight: HOST, pad: 0 })
  const cellPx = MIN_POINT_CELL_PX * 4
  layer.setViewport({ ...v, cellPx, originX: 0, originY: 0 })
  layer.drawNowForTest()

  const at = (cx: number, cy: number): [number, number, number, number] =>
    pixel(Math.round(cx * cellPx * devicePixelRatio), Math.round(cy * cellPx * devicePixelRatio))
  // An empty cell: the dot is the only thing there, so the grid did draw.
  const [dotR, dotG, dotB] = at(6.5, 6.5)
  expect([dotR > 200, dotG < 80, dotB < 80]).toEqual([true, true, true])
  // The head's cell: the piece covers the dot the grid put there.
  const [inkR, inkG, inkB] = at(2.5, 2.5)
  expect([inkR < 80, inkG < 80, inkB < 80]).toEqual([true, true, true])
})
