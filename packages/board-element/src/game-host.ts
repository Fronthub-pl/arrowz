// One session of the game and the animations it asks for. The element hands
// in a target (ride a piece out, shake it, emit an event) and this class does
// the rest, so `arrowz-board.ts` stays a shell and the rules can be tested in
// Node rather than through a browser.
//
// Not a Lit ReactiveController: nothing here needs a render pass, and a plain
// class with an injected target is what makes the Node tests possible.
import { goneIds, loadSession, newSession, play, saveSession } from '@arrowz/engine'
import type { Board, Session, SessionSnapshot } from '@arrowz/engine'

export type GameEvent =
  | { type: 'piece-removed'; detail: { pieceId: number; left: number } }
  | { type: 'life-lost'; detail: { pieceId: number; blockerId: number; distance: number } }
  | { type: 'finished'; detail: { pieces: number } }

export interface GameTarget {
  animateExit(pieceId: number, dir: number): Promise<void>
  shake(pieceId: number, distance: number): Promise<void>
  emit(event: GameEvent): void
}

/**
 * The shortest bump, in cells. A blocker directly in front leaves a distance
 * of zero, and a ride of zero cells draws nothing — but the bounce is what
 * tells the player where the blocker is (design §2), so it must be visible.
 */
export const MIN_SHAKE_CELLS = 0.35

export class GameHost {
  private session: Session | null = null
  /**
   * The ids that have left, as one Set per session, mutated in place. The
   * layer compares it by identity to decide whether it may keep its nodes, so
   * it must not be rebuilt on every move.
   */
  private gone = new Set<number>()

  constructor(private readonly target: GameTarget) {}

  get goneIds(): ReadonlySet<number> {
    return this.gone
  }

  isGone(pieceId: number): boolean {
    return this.gone.has(pieceId)
  }

  /** Starts a fresh session, or drops the session when there is no board. */
  setBoard(board: Board | null): void {
    this.session = board === null ? null : newSession(board)
    this.gone = new Set()
  }

  /** Resolves once the animation the click asked for has settled. */
  async click(pieceId: number): Promise<void> {
    const session = this.session
    if (session === null) return
    const { next, move } = play(session, pieceId)
    this.session = next
    if (move.kind === 'ignored') return
    if (move.kind === 'bounce') {
      this.target.emit({
        type: 'life-lost',
        detail: { pieceId, blockerId: move.blockerId, distance: move.distance },
      })
      await this.target.shake(pieceId, Math.max(move.distance, MIN_SHAKE_CELLS))
      return
    }
    this.gone.add(pieceId)
    this.target.emit({ type: 'piece-removed', detail: { pieceId, left: move.left } })
    await this.target.animateExit(pieceId, move.dir)
    if (move.status === 'won') {
      this.target.emit({ type: 'finished', detail: { pieces: session.board.pieces.length } })
    }
  }

  save(colored: boolean): SessionSnapshot | null {
    return this.session === null ? null : saveSession(this.session, colored)
  }

  /** Restores a session; throws when the snapshot does not describe this board. */
  load(snap: SessionSnapshot): void {
    const session = this.session
    if (session === null) throw new Error('arrowz-board: no board to load a game into')
    const loaded = loadSession(session.board, snap)
    this.session = loaded
    this.gone = new Set(goneIds(loaded))
  }
}
