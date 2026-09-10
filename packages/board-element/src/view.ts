// What a board looks like, and the diagnostic hue of a piece. No renderer and
// no DOM: mod.ts exports these, so they must not move when the layer does.

export interface BoardView {
  /** Stroke width as a fraction of a cell. */
  stroke: number
  /** Head width in cells; 0 = automatic. */
  headWidth: number
  /** Head height in cells; 0 = automatic. */
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
}

export const DEFAULT_VIEW: BoardView = {
  stroke: 0.5,
  headWidth: 0,
  headHeight: 0,
  rounded: true,
  colored: false,
  top: 0,
  voids: false,
  ink: '#232447',
  paper: '#f6f6fa',
  highlight: '#e8467c',
}

export const SHAKE_MS = 230

/** The golden angle, so consecutive ids land far apart on the wheel. */
const HUE_STEP = 137.508
const SATURATION = 0.62
const LIGHTNESS = 0.42

/**
 * The angle of a piece's diagnostic hue. It must be the id and not the
 * position in `board.pieces` — a game removes pieces, and a hue read off the
 * array would repaint the whole board after every move.
 */
export function hueDegrees(id: number): number {
  return (id * HUE_STEP) % 360
}

/** That hue as CSS. Part of the public surface: consumers colour legends with it. */
export function hueOf(id: number): string {
  return `hsl(${hueDegrees(id)} 62% 42%)`
}

/**
 * That same hue as bytes, for a vertex buffer.
 *
 * The GL layer takes the colour from here rather than computing it in a
 * shader: GLSL works in float32, where `id * 137.508` for an id in the tens
 * of thousands lands past 2^23 and quantises, so the board would print hues
 * that `hueOf` does not.
 */
export function hueBytes(id: number): [number, number, number] {
  const h = hueDegrees(id) / 360
  const c = (1 - Math.abs(2 * LIGHTNESS - 1)) * SATURATION
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = LIGHTNESS - c / 2
  const sector = Math.floor(h * 6) % 6
  const rgb: [number, number, number] = sector === 0
    ? [c, x, 0]
    : sector === 1
    ? [x, c, 0]
    : sector === 2
    ? [0, c, x]
    : sector === 3
    ? [0, x, c]
    : sector === 4
    ? [x, 0, c]
    : [c, 0, x]
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ]
}
