// The viewport in pure numbers: no DOM, so it is tested in Node. World units
// are cells; the host is in CSS pixels; `cellPx` ties the two together and
// the SVG viewBox is derived from the three numbers.
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
 * the fit already exceeds 48 px, so `fit` is always reachable), and the board
 * with its margin cannot leave the view: on an axis where it is larger than
 * the view the origin stays within it, where it is smaller it is centred.
 */
function clamp(v: ViewportInput & { cellPx: number; originX: number; originY: number }): Viewport {
  const f = fitScale(v)
  const m = marginOf(v)
  const cellPx = Math.min(Math.max(v.cellPx, f), Math.max(MAX_CELL_PX, f))
  const viewW = v.hostWidth / cellPx, viewH = v.hostHeight / cellPx
  const originX = viewW >= v.W + 2 * m ? (v.W - viewW) / 2 : Math.min(Math.max(v.originX, -m), v.W + m - viewW)
  const originY = viewH >= v.H + 2 * m ? (v.H - viewH) / 2 : Math.min(Math.max(v.originY, -m), v.H + m - viewH)
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

export function fit(v: ViewportInput): Viewport {
  return clamp({ ...v, cellPx: fitScale(v), originX: 0, originY: 0 })
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

export function viewBox(v: Viewport): string {
  return `${v.originX} ${v.originY} ${v.hostWidth / v.cellPx} ${v.hostHeight / v.cellPx}`
}
