import { play, type Session } from '@arrowz/engine'

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
