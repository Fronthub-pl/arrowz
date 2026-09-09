// The viewport in pure numbers: no DOM, so it is tested in Node. World units
// are cells; the host is in CSS pixels; `cellPx` ties the two together and
// the SVG viewBox is derived from the three numbers.
import type { Cell } from '@arrowz/engine'

export interface ViewportInput {
  W: number
  H: number
  hostWidth: number
  hostHeight: number
}

export interface Viewport extends ViewportInput {
  cellPx: number
  originX: number
  originY: number
  fitted: boolean
}

/** Above this a cell fills so much of the screen that orientation on the board falls apart. */
export const MAX_CELL_PX = 48

function fitScale(v: ViewportInput): number {
  return Math.min(v.hostWidth / v.W, v.hostHeight / v.H)
}

/**
 * Applies both bounds: the scale stays in [fit, 48 px] (or [fit, fit] when
 * the fit already exceeds 48 px, so `fit` is always reachable), and the board
 * cannot leave the view: on an axis where it is larger than the view the
 * origin stays within the board, where it is smaller the board is centred.
 */
function clamp(v: ViewportInput & { cellPx: number; originX: number; originY: number }): Viewport {
  const f = fitScale(v)
  const cellPx = Math.min(Math.max(v.cellPx, f), Math.max(MAX_CELL_PX, f))
  const viewW = v.hostWidth / cellPx, viewH = v.hostHeight / cellPx
  const originX = viewW >= v.W ? (v.W - viewW) / 2 : Math.min(Math.max(v.originX, 0), v.W - viewW)
  const originY = viewH >= v.H ? (v.H - viewH) / 2 : Math.min(Math.max(v.originY, 0), v.H - viewH)
  return {
    W: v.W,
    H: v.H,
    hostWidth: v.hostWidth,
    hostHeight: v.hostHeight,
    cellPx,
    originX,
    originY,
    fitted: Math.abs(cellPx - f) < 1e-9,
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
