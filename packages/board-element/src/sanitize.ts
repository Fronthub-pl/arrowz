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
    // Entry by entry: one unusable colour must not cost the others, and an
    // empty result is the same thing as no palette. Something that is not a
    // list at all is no palette either, and never a throw: a fresh array, so
    // no caller holds the shared default.
    palette: Array.isArray(view.palette) ? view.palette.filter((c) => typeof c === 'string' && isColor(c)) : [],
  }
}

/**
 * The margin a host may ask for, in cells. Published because the lab draws a
 * field for it and must declare the bounds it is actually held to: a slider
 * needs an end, and this is a margin, not a board dimension — it has no
 * reason to run anywhere near the sizes a board itself does.
 */
export const PAD_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 16 }

/** The margin asked for, in cells: clamped to PAD_RANGE. */
export function drawablePad(pad: number, fallback: number): number {
  return Math.min(Math.max(PAD_RANGE.min, finite(pad, fallback)), PAD_RANGE.max)
}

/**
 * The radius a dot may be given, in cells. Published because the lab draws a
 * field for it and must declare the bounds it is actually held to: the engine's
 * `VIEW_RANGE` covers the CLI's numbers, and the point grid is none of them.
 */
export const POINT_RADIUS_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 0.5 }

export function drawablePointRadius(radius: number, fallback: number): number {
  return Math.min(Math.max(finite(radius, fallback), POINT_RADIUS_RANGE.min), POINT_RADIUS_RANGE.max)
}
