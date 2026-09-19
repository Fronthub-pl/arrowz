// The diagnostic palette: the colour a piece is drawn in when colours are on.
// One source, so the SVG export and the board element's WebGL layer can never
// colour the same piece differently — the same reason geometry.ts owns the
// shapes. Knows neither Deno nor the DOM, and imports nothing, so engine.ts,
// command.ts and the board element can all reach it.

/** The golden angle, so consecutive ids land far apart on the wheel. */
const HUE_STEP = 137.508
const SATURATION = 0.62
const LIGHTNESS = 0.42

/**
 * The angle of a piece's diagnostic hue. It must be the id and not the
 * position in `board.pieces`: a game removes pieces, and a board file keeps
 * the ids it was written with — decodeBoard accepts gaps in them — so a hue
 * read off the array would repaint a board after every move, and would print
 * colours the screen does not.
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
