// The track a piece rides: the centres of its own cells from the head back to
// the tail, prolonged in front of the head by the straight exit ray. A piece
// never slides sideways off its shape — it drives down its own corridor, so
// every cell passes through the place of the one ahead of it. Positions along
// the track are arc lengths in cells, measured backwards from the head: 0 is
// the head cell, `i` the centre of cell `i`, a negative value a point already
// out on the ray. Adjacent cell centres are exactly one apart, which is what
// makes that measure free of any segment arithmetic.
//
// Knows no DOM, so it is tested in Node, like viewport.ts.
import { DIRS } from '@arrowz/engine'
import type { Cell } from '@arrowz/engine'

/** How many cells a leaving piece covers per second. */
export const EXIT_SPEED = 32
/** The shortest exit, so a piece already at the edge does not just blink out. */
export const EXIT_MIN_MS = 160
/** The longest exit, so a long piece crossing a big board does not hold up the game. */
export const EXIT_MAX_MS = 600
/** The share of a shake spent on the way out; the rest is the way back. */
const SHAKE_TURN = 0.4

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/** The centre of a cell, in the units `pieceShape` uses with cell 1 and pad 0. */
function centre(c: Cell): [number, number] {
  return [c.x + 0.5, c.y + 0.5]
}

/**
 * The point of the track at arc length `u` behind the head.
 *
 * The function is total on purpose: before the head it follows the exit ray,
 * behind the tail it follows the last leg on. Both ends are reached in an
 * ordinary ride — the front of a piece is on the ray from the first frame,
 * and the line of a one-cell piece starts just behind its only centre.
 */
export function trackPoint(cells: readonly Cell[], dir: number, u: number): [number, number] {
  const last = cells.length - 1
  if (u <= 0) {
    const { dx, dy } = at(DIRS, dir)
    const [hx, hy] = centre(at(cells, 0))
    return [hx - dx * u, hy - dy * u]
  }
  if (u >= last) {
    const [tx, ty] = centre(at(cells, last))
    const { dx, dy } = at(DIRS, dir)
    // Where the track comes from at the tail: the cell before it, or, for a
    // piece of one cell, the point it is headed away from.
    const prev: [number, number] = last > 0 ? centre(at(cells, last - 1)) : [tx + dx, ty + dy]
    const over = u - last
    return [tx + (tx - prev[0]) * over, ty + (ty - prev[1]) * over]
  }
  const i = Math.floor(u)
  const [ax, ay] = centre(at(cells, i))
  const [bx, by] = centre(at(cells, i + 1))
  const t = u - i
  return [ax + (bx - ax) * t, ay + (by - ay) * t]
}

/** Appends a point unless it repeats the one already there. */
function push(pts: [number, number][], p: [number, number]): void {
  const prev = pts[pts.length - 1]
  if (prev && Math.abs(prev[0] - p[0]) < 1e-9 && Math.abs(prev[1] - p[1]) < 1e-9) return
  pts.push(p)
}

/**
 * The polyline of a piece's line after riding `shift` cells down its track.
 * `front` is the arc length of the line's first point, which sits a little
 * behind the head centre where the head polygon swallows it.
 *
 * Every cell centre between the two ends is emitted, not just the moved ends:
 * a polyline drawn from the ends alone would cut the corners, turning an L
 * into a diagonal the moment it started to move.
 */
export function trackLine(
  cells: readonly Cell[],
  dir: number,
  front: number,
  shift: number,
): [number, number][] {
  const last = cells.length - 1
  // A one-cell piece has its line behind its only centre, so the back of the
  // line is the front of it; anything longer ends at the tail centre.
  const back = Math.max(last, front)
  const a = front - shift, b = back - shift
  const pts: [number, number][] = [trackPoint(cells, dir, a)]
  const from = Math.max(0, Math.ceil(a))
  const to = Math.min(last, Math.floor(b))
  for (let k = from; k <= to; k++) push(pts, centre(at(cells, k)))
  push(pts, trackPoint(cells, dir, b))
  return pts
}

/**
 * How far the head travels for the whole piece to clear the board: the way
 * out of the edge it faces, plus the piece's own length so no tail is left
 * behind, plus one cell of slack for the head tip and the tail rounding.
 */
export function exitDistance(cells: readonly Cell[], dir: number, W: number, H: number): number {
  const { dx, dy } = at(DIRS, dir)
  const head = at(cells, 0)
  const toEdge = dx > 0 ? W - head.x : dx < 0 ? head.x + 1 : dy > 0 ? H - head.y : head.y + 1
  return toEdge + cells.length + 1
}

/**
 * How long a ride of `distance` cells lasts. One speed for every piece, so a
 * long arrow leaving from the far side does not shoot out faster than a short
 * one at the edge; the two bounds keep the shortest ride visible and the
 * longest one out of the player's way.
 */
export function exitMs(distance: number): number {
  return Math.min(EXIT_MAX_MS, Math.max(EXIT_MIN_MS, distance / EXIT_SPEED * 1000))
}

/** How far along its track a shaken piece sits at `progress`: out, then back to rest. */
export function shakeShift(progress: number, distance: number): number {
  if (progress <= SHAKE_TURN) {
    const back = 1 - progress / SHAKE_TURN
    return distance * (1 - back * back)
  }
  return distance * (1 - (progress - SHAKE_TURN) / (1 - SHAKE_TURN))
}
