// What the element hands the layer and the viewport, as opposed to what the
// host set. The properties and attributes keep the host's values, exactly as
// `margin` already keeps its own apart from `pad`; only the drawing is
// corrected, so Lit never reflects a corrected value back. The bounds are the
// geometry's, not a UI's: a stroke wider than a cell and a dot wider than half
// a cell overlap their neighbours, and nothing narrower is refused for being
// ugly. Pure and DOM-free: the colour check is passed in, so Node can test it.
import { type BoardView, DEFAULT_VIEW } from './view.ts'

export type IsColor = (css: string) => boolean

/** `value` when it is a finite number, `fallback` otherwise (NaN, ±Infinity, a string). */
function finite(value: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function drawableColor(css: string, fallback: string, isColor: IsColor): string {
  return typeof css === 'string' && isColor(css) ? css : fallback
}

export function drawableView(view: BoardView, isColor: IsColor): BoardView {
  const stroke = finite(view.stroke, DEFAULT_VIEW.stroke)
  return {
    ...view,
    stroke: stroke <= 0 ? DEFAULT_VIEW.stroke : Math.min(stroke, 1),
    headWidth: Math.max(0, finite(view.headWidth, DEFAULT_VIEW.headWidth)),
    headHeight: Math.max(0, finite(view.headHeight, DEFAULT_VIEW.headHeight)),
    top: Math.max(0, Math.floor(finite(view.top, DEFAULT_VIEW.top))),
    ink: drawableColor(view.ink, DEFAULT_VIEW.ink, isColor),
    paper: drawableColor(view.paper, DEFAULT_VIEW.paper, isColor),
    highlight: drawableColor(view.highlight, DEFAULT_VIEW.highlight, isColor),
  }
}

/** The margin asked for, in cells: never negative, and large is allowed (it is drawable). */
export function drawablePad(pad: number, fallback: number): number {
  return Math.max(0, finite(pad, fallback))
}

/** A dot's radius in cells: above half a cell the dots merge into a flood of colour. */
export function drawablePointRadius(radius: number, fallback: number): number {
  return Math.min(Math.max(finite(radius, fallback), 0), 0.5)
}
