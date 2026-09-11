// Colours as the GL wants them: four floats, alpha unmultiplied. A CSS colour
// is parsed by the browser through a one-pixel canvas; a diagnostic hue comes
// straight from view.ts's bytes.
import { hueBytes } from './view.ts'

export type Rgba = [number, number, number, number]

/** A piece's diagnostic hue as GL floats, without going through CSS and a canvas. */
export function hueRgba(id: number): Rgba {
  const [r, g, b] = hueBytes(id)
  return [r / 255, g / 255, b / 255, 1]
}

/**
 * A single 2D context, reused by every `rgbaOf` call rather than one canvas
 * created per call. Lazy so importing this module never touches the DOM.
 */
let probeCtx: CanvasRenderingContext2D | null | undefined

function probe(): CanvasRenderingContext2D | null {
  if (probeCtx === undefined) probeCtx = document.createElement('canvas').getContext('2d')
  return probeCtx
}

/**
 * A CSS colour as GL floats. The browser does the parsing, so anything a
 * consumer may put in `view.ink` works — names, hex of either length, hsl(),
 * the colour functions of tomorrow — without this file owning a parser.
 *
 * Resolved once per `BoardView`, in `GlLayer.setBoard` (and per point colour,
 * in `GlLayer.setPoints`) — never from the draw loop. A frame draws up to
 * three colours, and each call here is a canvas readback; paid once per board
 * or view change, it is free, paid sixty times a second it is not.
 */
export function rgbaOf(css: string): Rgba {
  const ctx = probe()
  if (!ctx) return [0, 0, 0, 1]
  // The one pixel is cleared first: `fillRect` composites, so a half
  // transparent colour would otherwise be read over whatever the previous
  // call left there and come back opaque.
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  const [r, g, b, a] = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 255]
  return [r / 255, g / 255, b / 255, a / 255]
}
