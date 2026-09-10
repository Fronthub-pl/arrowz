// The viewport in pure numbers: no DOM, so it is tested in Node. World units
// are cells; the host is in CSS pixels; `cellPx` ties the two together, and
// the layer turns the three numbers into the uniforms it draws the board
// with. Nothing here knows what draws it.
import type { Cell } from '@arrowz/engine'

export interface ViewportInput {
  W: number
  H: number
  hostWidth: number
  hostHeight: number
  /** Margin asked for around the board, in cells; 0 for none. */
  pad: number
}

export interface Viewport extends ViewportInput {
  cellPx: number
  originX: number
  originY: number
  fitted: boolean
  /** The margin actually kept, in cells: `pad`, or wider when `pad` would go under MIN_PAD_PX. */
  margin: number
}

/** Above this a cell fills so much of the screen that orientation on the board falls apart. */
export const MAX_CELL_PX = 48

/** Under this a margin stops reading as one on screen, whatever it is worth in cells. */
export const MIN_PAD_PX = 16

/** Under this a cell's raster is dense enough that the point grid moirés instead of reading as dots. */
export const MIN_POINT_CELL_PX = 6

/**
 * The margin actually kept, in cells. A margin measured in cells shrinks with
 * them, so on a 400x400 board fitted into a laptop it would come to a pixel or
 * two; it is widened until it is worth MIN_PAD_PX on the fitted board.
 * Solving `m * host / (dim + 2m) = MIN_PAD_PX` for `m` gives the closed form
 * below, so nothing has to be searched for and the result cannot oscillate.
 *
 * A `pad` of 0 stays 0: asking for no margin is not asking for a small one.
 */
function marginOf(v: ViewportInput): number {
  if (v.pad <= 0) return 0
  const room = 2 * MIN_PAD_PX
  const byWidth = v.hostWidth > room ? MIN_PAD_PX * v.W / (v.hostWidth - room) : 0
  const byHeight = v.hostHeight > room ? MIN_PAD_PX * v.H / (v.hostHeight - room) : 0
  return Math.max(v.pad, byWidth, byHeight)
}

function fitScale(v: ViewportInput): number {
  const m = marginOf(v)
  return Math.min(v.hostWidth / (v.W + 2 * m), v.hostHeight / (v.H + 2 * m))
}

/**
 * Applies both bounds: the scale stays in [fit, 48 px] (or [fit, fit] when
 * the fit already exceeds 48 px, so `fit` is always reachable), and the centre
 * of the view stays on the board with its margin.
 *
 * The centre rule is what lets `zoomAt` mean what it says. A stricter one —
 * "the board must fill the view" — has to overrule the anchor as soon as the
 * cursor is near an edge, because holding the point there requires showing
 * blank beside the board; measured on a 100x100 board, eight wheel steps into a
 * corner dragged the point 583 px away from the cursor. Zooming towards a point
 * pulls the view's centre towards it, so on the board this bound never binds
 * and the anchor is exact; it only stops a pan from leaving the board behind.
 */
function clamp(v: ViewportInput & { cellPx: number; originX: number; originY: number }): Viewport {
  const f = fitScale(v)
  const m = marginOf(v)
  const cellPx = Math.min(Math.max(v.cellPx, f), Math.max(MAX_CELL_PX, f))
  const viewW = v.hostWidth / cellPx, viewH = v.hostHeight / cellPx
  /** The origin that keeps the middle of the view between the board's two margins. */
  const axis = (o: number, dim: number, view: number): number =>
    Math.min(Math.max(o, -m - view / 2), dim + m - view / 2)
  const originX = axis(v.originX, v.W, viewW)
  const originY = axis(v.originY, v.H, viewH)
  return {
    W: v.W,
    H: v.H,
    hostWidth: v.hostWidth,
    hostHeight: v.hostHeight,
    pad: v.pad,
    cellPx,
    originX,
    originY,
    fitted: Math.abs(cellPx - f) < 1e-9,
    margin: m,
  }
}

/**
 * The whole board in the middle of the host. `clamp` no longer centres anything
 * — it only bounds — so the middle is named here, which is also the one place
 * that has to know it: fitting is the gesture that asks for it.
 */
export function fit(v: ViewportInput): Viewport {
  const cellPx = fitScale(v)
  const viewW = v.hostWidth / cellPx, viewH = v.hostHeight / cellPx
  return clamp({ ...v, cellPx, originX: (v.W - viewW) / 2, originY: (v.H - viewH) / 2 })
}

/** Scales by `factor` keeping the world point under the screen point (px, py) fixed. */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const wx = v.originX + px / v.cellPx, wy = v.originY + py / v.cellPx
  const f = fitScale(v)
  const cellPx = Math.min(Math.max(v.cellPx * factor, f), Math.max(MAX_CELL_PX, f))
  return clamp({ ...v, cellPx, originX: wx - px / cellPx, originY: wy - py / cellPx })
}

export function zoomBy(v: Viewport, factor: number): Viewport {
  return zoomAt(v, factor, v.hostWidth / 2, v.hostHeight / 2)
}

/** Drags the board by a screen delta: the content follows the pointer. */
export function panBy(v: Viewport, dxPx: number, dyPx: number): Viewport {
  return clamp({ ...v, originX: v.originX - dxPx / v.cellPx, originY: v.originY - dyPx / v.cellPx })
}

export function resize(v: Viewport, hostWidth: number, hostHeight: number): Viewport {
  const next = { ...v, hostWidth, hostHeight }
  return v.fitted ? fit(next) : clamp(next)
}

export function screenToCell(v: Viewport, px: number, py: number): Cell | null {
  const x = Math.floor(v.originX + px / v.cellPx)
  const y = Math.floor(v.originY + py / v.cellPx)
  return x >= 0 && y >= 0 && x < v.W && y < v.H ? { x, y } : null
}
