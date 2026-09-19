// What a board looks like. No renderer and no DOM: mod.ts exports these, so
// they must not move when the layer does. The diagnostic hue is not defined
// here any more — it is the engine's palette, re-exported at the foot.
import { DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED } from '@arrowz/engine'
import type { View } from '@arrowz/engine'

export interface BoardView {
  /** Stroke width as a fraction of a cell. */
  stroke: number
  /** Head width in cells; 0 = automatic. */
  headWidth: number
  /** Head height in cells, taken literally: 0 draws a head of no height. */
  headHeight: number
  /** Round the corners a piece turns through, and cap its tail with a disc. */
  rounded: boolean
  /** Per-piece hues: the diagnostic mode of the lab. */
  colored: boolean
  /** How many longest pieces are drawn highlighted and on top. */
  top: number
  /** Draw the cells the generator failed to carve. */
  voids: boolean
  ink: string
  paper: string
  highlight: string
  /**
   * Colours the pieces are drawn in when `colored` is on, one per piece by the
   * assignment of palette.ts. Empty keeps the golden angle over the piece id,
   * which is what every board drew before themes existed.
   */
  palette: string[]
}

export const DEFAULT_VIEW: BoardView = {
  stroke: 0.5,
  headWidth: 0,
  // The engine's number, not a copy of it: the CLI export and this board draw
  // the same head without anyone setting a knob.
  headHeight: DEFAULT_HEAD_HEIGHT,
  rounded: DEFAULT_ROUNDED,
  colored: false,
  top: 0,
  voids: false,
  ink: '#232447',
  paper: '#f6f6fa',
  highlight: '#e8467c',
  palette: [],
}

/** The lab's view as the element takes it; `cell` is a size in the exported SVG and does not apply. */
export function boardViewOf(view: View, voids: boolean): Partial<BoardView> {
  return {
    stroke: view.stroke,
    headWidth: view.headWidth,
    headHeight: view.headHeight,
    rounded: view.rounded,
    colored: view.colored,
    top: view.top,
    voids,
  }
}

export const SHAKE_MS = 230

/**
 * The diagnostic palette is the engine's now (`colors.ts`): the SVG export
 * colours a piece from the same formula over the same id, so a board cannot
 * be one set of colours on screen and another in a file. Re-exported here
 * because `mod.ts` publishes these three as part of this package's surface,
 * and because `gl-color.ts` and `tesselate.ts` read them from this module.
 */
export { hueBytes, hueDegrees, hueOf } from '@arrowz/engine'
