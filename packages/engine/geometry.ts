// The shapes of the pieces in output units: what toSvg formats into SVG text
// and what the board element inserts into its own SVG. One source, so the
// CLI export and the interactive board can never draw a head differently.
// Knows neither Deno nor the DOM.
import type { Board, Piece } from './types.ts'

/**
 * Reads an index the algorithm guarantees to be valid. Under
 * noUncheckedIndexedAccess every `arr[i]` is `T | undefined`; a silent
 * `?? 0` would change a board, so an impossible miss throws instead.
 */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/** One of the four directions; `ch` is the head glyph of `render`. */
export type Dir = { dx: number; dy: number; ch: string }

export const DIRS: readonly Dir[] = [
  { dx: 0, dy: -1, ch: '↑' }, // 0 up
  { dx: 1, dy: 0, ch: '→' }, // 1 right
  { dx: 0, dy: 1, ch: '↓' }, // 2 down
  { dx: -1, dy: 0, ch: '←' }, // 3 left
]

/**
 * The head height every surface starts from, in cells: the CLI's DEFAULT_VIEW,
 * the board element's BoardView and toSvg's own fallback. The one place the
 * number lives, and it lives HERE rather than next to DEFAULT_VIEW because
 * command.ts imports engine.ts, so engine.ts cannot import command.ts back;
 * geometry.ts imports nothing but types.ts, so all three can reach it.
 * (packages/cli/lab.html repeats it as an input value: HTML imports nothing.)
 */
export const DEFAULT_HEAD_HEIGHT = 1

/**
 * Whether a piece's turns are drawn rounded and its tail as a disc, the
 * default for every surface that has not been told otherwise: toSvg's own
 * fallback, the CLI's DEFAULT_VIEW and the board element's BoardView. Lives
 * here for the same reason DEFAULT_HEAD_HEIGHT does: geometry.ts is the one
 * cycle-free home command.ts, engine.ts and the board element can all reach.
 */
export const DEFAULT_ROUNDED = true

export interface ShapeOptions {
  /** Size of one cell in output units. */
  cell: number
  /** Margin before the first cell, in output units. */
  pad: number
  /** Stroke width of this piece, in output units. */
  width: number
  /** Head width in cells; 0 = automatic. */
  headWidth: number
  /** Head height in cells, taken literally: 0 draws a head of no height. */
  headHeight: number
}

export interface PieceShape {
  /** Polyline points: the head base first, then the cells after the head. */
  line: [number, number][]
  /** Head polygon: tip, one side, (two collar points when the line is as wide as the head), the other side. */
  head: [number, number][]
  /** The tail rounding: a circle of the line's radius on the last cell. */
  tail: { x: number; y: number; r: number }
}

/**
 * The shape of one piece. The arithmetic is the one toSvg had inline, in the
 * same order, so extracting it left the CLI output byte-identical:
 * - the head is exactly headHeight cells tall, whatever that says;
 * - a thin line (under half a cell) gets an arrow: an isosceles triangle
 *   0.4 of a cell plus 0.9 of the line width wide;
 * - from half a cell up the line ends as a sharpened stick: a triangle as
 *   wide as the line, with a collar behind the base;
 * - the tip is always 0.48 past the head centre, so a bigger head grows backwards;
 * - line and head overlap by 0.2 of the line width, so no seam shows.
 *
 * Why those numbers: the head follows the width of ITS line (highlighted
 * pieces are thicker). From half a cell up there is no room for a wider head
 * between neighbours, hence the stick. The tip stays inside the head cell —
 * an overshooting tip looked wrong and facing heads overlapped. A head only
 * slightly wider than the line, with the cap ending short of the base, looked
 * like a triangle perched on a pill, with notches at the corners; a fixed head
 * was swallowed by the cap from a stroke of 0.5 up. The width can be set by
 * hand (headWidth, in cells; 0 = automatic), and a head narrower than its line
 * is widened to the line; the height has no automatic mode at all.
 */
export function pieceShape(pc: Piece, o: ShapeOptions): PieceShape {
  const { cell, pad, width: w } = o
  const cx = (x: number): number => pad + x * cell + cell / 2
  const cy = (y: number): number => pad + y * cell + cell / 2
  const { dx, dy } = at(DIRS, pc.dir)
  const headCell = at(pc.cells, 0)
  const hx = cx(headCell.x), hy = cy(headCell.y)
  const stick = w >= 0.5 * cell - 1e-9
  const autoWidth = stick ? w : 0.4 * cell + 0.9 * w
  const half = Math.max(w, o.headWidth > 0 ? o.headWidth * cell : autoWidth) / 2
  const height = o.headHeight * cell
  const tip = 0.48 * cell
  const tx = hx + dx * tip, ty = hy + dy * tip
  const bx = tx - dx * height, by = ty - dy * height
  // Line and head overlap by 0.2 of the line width, so no anti-aliasing seam
  // shows at the base: a head the line fits into that deep takes the line that
  // far past the base; a head as wide as the line (a stick) gets a collar of
  // that length behind the base instead (a five-point outline).
  const lap = 0.2 * w
  const fits = w / 2 <= half * (1 - lap / height) + 1e-9
  const head: [number, number][] = [[tx, ty], [bx + dy * half, by - dx * half]]
  if (!fits) {
    head.push(
      [bx - dx * lap + dy * half, by - dy * lap - dx * half],
      [bx - dx * lap - dy * half, by - dy * lap + dx * half],
    )
  }
  head.push([bx - dy * half, by + dx * half])
  const tailCell = at(pc.cells, pc.cells.length - 1)
  const ex = fits ? bx + dx * lap : bx, ey = fits ? by + dy * lap : by
  const line: [number, number][] = [[ex, ey]]
  for (let i = 1; i < pc.cells.length; i++) {
    const c = at(pc.cells, i)
    line.push([cx(c.x), cy(c.y)])
  }
  return { line, head, tail: { x: cx(tailCell.x), y: cy(tailCell.y), r: w / 2 } }
}

/**
 * The cells the generator failed to carve, merged into horizontal runs (in
 * cells). With 55 thousand holes, separate rectangles would produce a
 * document that cannot be displayed.
 */
export function voidStrips(board: Board): { x: number; y: number; len: number }[] {
  const { W, H, owner } = board
  const strips: { x: number; y: number; len: number }[] = []
  for (let y = 0; y < H; y++) {
    let start = -1
    for (let x = 0; x <= W; x++) {
      const empty = x < W && owner[y * W + x] === -1
      if (empty && start < 0) start = x
      if (!empty && start >= 0) {
        strips.push({ x: start, y, len: x - start })
        start = -1
      }
    }
  }
  return strips
}
