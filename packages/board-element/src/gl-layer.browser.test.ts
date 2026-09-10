import { defaultParams, generate } from '@arrowz/engine'
import type { Board } from '@arrowz/engine'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { GlLayer } from './gl-layer.ts'
import { DEFAULT_VIEW } from './view.ts'
import { fit } from './viewport.ts'

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
