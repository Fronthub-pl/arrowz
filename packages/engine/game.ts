// The game of §10 of the design, reduced to what a board can decide on its
// own: whether a click is a legal move, which piece blocked it, and whether
// the board is empty. Lives, the stopwatch, streaks and scoring belong to the
// host, so nothing here counts them.
//
// A corridor is a ray from the head cell minus the piece's own cells, and it
// does not depend on the state of the board (design §2). Removing a piece can
// therefore only free others: the board never has to be rewritten, and a
// session is nothing but the set of pieces that have left.
//
// Runtime-neutral, like engine.ts: no Deno, DOM, Node or process API.
import { fingerprint } from './engine.ts'
import { DIRS } from './geometry.ts'
import type { Board, Piece } from './types.ts'

export interface Session {
  readonly board: Board
  /** Indexed by piece id: 1 once the piece has left the board. */
  readonly gone: Uint8Array
  /**
   * Piece id to its position in `board.pieces`; -1 for an id no piece has.
   * An internal lookup cache for `pieceOf`, not part of the session's meaning
   * — callers should not read it.
   */
  readonly index: Int32Array
  /** Pieces still on the board. */
  readonly left: number
  readonly status: 'playing' | 'won'
}

export type Move =
  // `dir` is the piece's own `dir`: 0 up, 1 right, 2 down, 3 left, the index
  // into DIRS that `animateExit` takes.
  | { kind: 'exit'; pieceId: number; dir: number; left: number; status: 'playing' | 'won' }
  | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number }
  | { kind: 'ignored' }

function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}

/** A fresh session over a board. The board is never modified afterwards. */
export function newSession(board: Board): Session {
  let maxId = -1
  for (const pc of board.pieces) maxId = Math.max(maxId, pc.id)
  const index = new Int32Array(maxId + 1).fill(-1)
  board.pieces.forEach((pc, i) => {
    index[pc.id] = i
  })
  return {
    board,
    gone: new Uint8Array(maxId + 1),
    index,
    left: board.pieces.length,
    status: board.pieces.length === 0 ? 'won' : 'playing',
  }
}

/** The piece of an id, or null when no piece on this board carries it. */
function pieceOf(session: Session, id: number): Piece | null {
  if (!Number.isInteger(id) || id < 0 || id >= session.index.length) return null
  const i = at(session.index, id)
  return i < 0 ? null : at(session.board.pieces, i)
}

/**
 * Walks the corridor: the ray from the head cell along the piece's direction,
 * skipping the piece's own cells and the cells of pieces that have left.
 * Returns the blocker and how many cells the piece may advance before it
 * touches it, or null when the ray reaches the edge.
 *
 * Uncarved cells (-1) and voids (-2) never block: the pieces cover the board,
 * and a void strip is a hole in the paper, not an arrow.
 */
function scan(session: Session, piece: Piece): { blockerId: number; distance: number } | null {
  const { board, gone } = session
  const { dx, dy } = at(DIRS, piece.dir)
  const head = at(piece.cells, 0)
  let x = head.x + dx
  let y = head.y + dy
  let steps = 1
  while (x >= 0 && y >= 0 && x < board.W && y < board.H) {
    const owner = at(board.owner, y * board.W + x)
    if (owner >= 0 && owner !== piece.id && at(gone, owner) === 0) {
      return { blockerId: owner, distance: steps - 1 }
    }
    x += dx
    y += dy
    steps++
  }
  return null
}

/**
 * One click. The session handed in is never modified: `gone` is copied, which
 * on the 1000x1000 ceiling is a memcpy of 86 kB, where a copied Set would be a
 * walk over every entry.
 */
export function play(session: Session, pieceId: number): { next: Session; move: Move } {
  const piece = pieceOf(session, pieceId)
  if (piece === null || at(session.gone, pieceId) === 1) return { next: session, move: { kind: 'ignored' } }
  const hit = scan(session, piece)
  if (hit !== null) {
    return { next: session, move: { kind: 'bounce', pieceId, distance: hit.distance, blockerId: hit.blockerId } }
  }
  const gone = session.gone.slice()
  gone[pieceId] = 1
  const left = session.left - 1
  const status = left === 0 ? 'won' : 'playing'
  return {
    next: { board: session.board, gone, index: session.index, left, status },
    move: { kind: 'exit', pieceId, dir: piece.dir, left, status },
  }
}

/**
 * A saved game. It holds the removed ids and enough of the board's identity
 * to refuse a snapshot taken on a different one; the seed and the parameters
 * are not here, because a Board does not carry them and the fingerprint
 * identifies the board more strictly than a seed would.
 */
export interface SessionSnapshot {
  v: 1
  board: { W: number; H: number; pieces: number; fingerprint: string }
  removed: number[]
  colored: boolean
}

/** The ids of the pieces that have left, ascending. */
export function goneIds(session: Session): number[] {
  const ids: number[] = []
  for (const pc of session.board.pieces) {
    if (at(session.gone, pc.id) === 1) ids.push(pc.id)
  }
  return ids.sort((a, b) => a - b)
}

export function saveSession(session: Session, colored: boolean): SessionSnapshot {
  const { board } = session
  return {
    v: 1,
    board: { W: board.W, H: board.H, pieces: board.pieces.length, fingerprint: fingerprint(board) },
    removed: goneIds(session),
    colored,
  }
}

/**
 * Restores a session over a board. The cheap gates come first: the size and
 * the piece count are two comparisons, while the fingerprint walks the whole
 * owner grid — two million steps on the 1000x1000 ceiling.
 */
export function loadSession(board: Board, snap: SessionSnapshot): Session {
  if (
    snap === null || typeof snap !== 'object' || typeof snap.board !== 'object' || snap.board === null ||
    !Array.isArray(snap.removed)
  ) {
    throw new Error('game: snapshot does not have the shape of a SessionSnapshot')
  }
  if (snap.v !== 1) throw new Error(`game: snapshot version ${snap.v} is not readable`)
  if (snap.board.W !== board.W || snap.board.H !== board.H) {
    throw new Error(`game: snapshot board is ${snap.board.W}x${snap.board.H}, this one is ${board.W}x${board.H}`)
  }
  if (snap.board.pieces !== board.pieces.length) {
    throw new Error(`game: snapshot board has ${snap.board.pieces} pieces, this one has ${board.pieces.length}`)
  }
  if (snap.board.fingerprint !== fingerprint(board)) {
    throw new Error('game: snapshot fingerprint does not match this board')
  }
  const session = newSession(board)
  const gone = session.gone
  let left = session.left
  for (const id of snap.removed) {
    if (!Number.isInteger(id) || id < 0 || id >= session.index.length || at(session.index, id) < 0) {
      throw new Error(`game: snapshot names piece ${id}, which is not on this board`)
    }
    if (at(gone, id) === 1) continue
    gone[id] = 1
    left--
  }
  return { board, gone, index: session.index, left, status: left === 0 ? 'won' : 'playing' }
}
