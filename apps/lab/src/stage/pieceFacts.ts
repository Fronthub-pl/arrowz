import { type BoardData, play, type Session } from '@fronthub/arrowz-engine'

/** What the inspect card says about one piece. `dir`: 0 up, 1 right, 2 down, 3 left. */
export interface PieceFacts {
  id: number
  length: number
  dir: number
  blocker: { id: number; distance: number } | null
}

/**
 * The piece's facts by the game's own rule: the move a click would make in
 * `session`, so pieces that have left block nothing, and a piece that has
 * left has no facts.
 */
export function pieceFacts(session: Session, id: number): PieceFacts | null {
  const piece = session.board.pieces.find((pc) => pc.id === id)
  if (piece === undefined) return null
  const { move } = play(session, id)
  if (move.kind === 'ignored') return null
  return {
    id,
    length: piece.cells.length,
    dir: piece.dir,
    blocker: move.kind === 'bounce' ? { id: move.blockerId, distance: move.distance } : null,
  }
}

/** Each board's piece lengths by id, built on its first look-up: a hover can ask at every move. */
const LENGTHS = new WeakMap<BoardData, Map<number, number>>()

/** The cell count of the piece with this id, or null when the board has none. */
export function pieceLength(board: BoardData, id: number): number | null {
  let lengths = LENGTHS.get(board)
  if (lengths === undefined) {
    lengths = new Map(board.pieces.map((pc) => [pc.id, pc.cells.length]))
    LENGTHS.set(board, lengths)
  }
  return lengths.get(id) ?? null
}
