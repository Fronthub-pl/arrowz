import type {
  ArrowzBoard,
  FinishedEvent,
  LifeLostEvent,
  PieceClickEvent,
  PieceRemovedEvent,
} from '@arrowz/board-element'
import { type BoardData, newSession, play, type Session } from '@arrowz/engine'
import type { Dict } from '@arrowz/engine/i18n'
import { type ReactElement, type RefObject, useMemo, useState } from 'react'
import { useDictionary } from '../i18n'
import { Segmented } from '../shell/Segmented'
import { useStore } from '../state/store'
import type { BoardMode } from '../state/ui.slice'
import { pieceFacts } from './pieceFacts'

/** The engine's `DIRS` glyphs, which `@arrowz/engine` does not export; indexed by `Piece.dir`. */
const GLYPHS = ['↑', '→', '↓', '←'] as const
const DIR_WORDS = ['dirUp', 'dirRight', 'dirDown', 'dirLeft'] as const

/**
 * The game on the board on stage, as the lab mirrors it, and the piece
 * inspected in the current mode. The game outlives a change of mode; only
 * Reset and a new board start it over.
 */
interface Tally {
  board: BoardData | null
  mode: BoardMode
  inspected: number | null
  /** The element's game, advanced on each `piece-removed`; null while nothing has left. */
  game: Session | null
  left: number
  mistakes: number
  cleared: boolean
}

function fresh(board: BoardData | null, mode: BoardMode): Tally {
  return { board, mode, inspected: null, game: null, left: board?.pieces.length ?? 0, mistakes: 0, cleared: false }
}

/** Sessions never change once built, so one fresh session per board serves every game on it. */
const FRESH = new WeakMap<BoardData, Session>()

function freshSession(board: BoardData): Session {
  let session = FRESH.get(board)
  if (session === undefined) {
    session = newSession(board)
    FRESH.set(board, session)
  }
  return session
}

/** The board as it now stands, for the inspect card. */
function gameOf(tally: Tally): Session | null {
  return tally.game ?? (tally.board === null ? null : freshSession(tally.board))
}

/** A piece has left or a mistake was made: something for Reset to undo. */
function progressed(tally: Tally): boolean {
  return tally.left < (tally.board?.pieces.length ?? 0) || tally.mistakes > 0
}

export interface BoardSession {
  tally: Tally
  onPieceClick(event: PieceClickEvent): void
  onPieceRemoved(event: PieceRemovedEvent): void
  onLifeLost(event: LifeLostEvent): void
  onFinished(event: FinishedEvent): void
  reset(): void
}

/**
 * The game is keyed by the board on stage, the inspected piece by the board
 * and the mode, both adjusted while rendering rather than in an effect. A
 * mode switch leaves the element's game alone, so the pieces that left stay
 * gone in View and Inspect. Reset uses `restart()` only, never `loadState`,
 * which would give the element a colour of its own.
 */
export function useBoardSession(
  board: BoardData | null,
  mode: BoardMode,
  element: RefObject<ArrowzBoard | null>,
): BoardSession {
  const [stored, setTally] = useState(() => fresh(board, mode))
  let tally = stored
  if (stored.board !== board) tally = fresh(board, mode)
  else if (stored.mode !== mode) tally = { ...stored, mode, inspected: null }
  if (tally !== stored) setTally(tally)
  return {
    tally,
    onPieceClick: (event) => {
      if (mode === 'inspect') setTally((t) => ({ ...t, inspected: event.detail.pieceId }))
    },
    onPieceRemoved: (event) =>
      setTally((t) => {
        const game = gameOf(t)
        return {
          ...t,
          left: event.detail.left,
          game: game === null ? null : play(game, event.detail.pieceId).next,
        }
      }),
    onLifeLost: () => setTally((t) => ({ ...t, mistakes: t.mistakes + 1 })),
    // `finished` trails the last exit animation, so a Reset or a new board
    // can land first; only a tally with nothing left may read as cleared.
    onFinished: () => setTally((t) => (t.left === 0 ? { ...t, cleared: true } : t)),
    reset: () => {
      element.current?.restart()
      setTally(fresh(board, mode))
    },
  }
}

/** The View / Inspect / Play choice, in the strip under the frame. */
export function BoardModeSwitch(): ReactElement {
  const dict = useDictionary()
  const mode = useStore((state) => state.ui.boardMode)
  const setBoardMode = useStore((state) => state.ui.setBoardMode)
  const options = useMemo(
    () =>
      [
        { value: 'view', label: dict.t('boardModeView') },
        { value: 'inspect', label: dict.t('boardModeInspect') },
        { value: 'play', label: dict.t('boardModePlay') },
      ] as const,
    [dict],
  )
  return (
    <div className="fw-mode">
      <Segmented label={dict.t('boardModeLabel')} options={options} value={mode} onChange={setBoardMode} />
    </div>
  )
}

function inspectText(dict: Dict, session: Session | null, id: number | null): string {
  const facts = session === null || id === null ? null : pieceFacts(session, id)
  if (facts === null) return dict.t('inspectHint')
  const word = DIR_WORDS[facts.dir]
  const dir = `${GLYPHS[facts.dir] ?? '?'} ${word === undefined ? '?' : dict.t(word)}`
  const way =
    facts.blocker === null ? dict.t('pieceFree') : dict.t('pieceBlocked', facts.blocker.id, facts.blocker.distance)
  return `${dict.t('pieceFacts', facts.id, facts.length, dir)} · ${way}`
}

/**
 * The line beside the mode control: the inspected piece's facts, or the
 * game's counts, and Reset in both. Nothing in View.
 */
export function BoardModeLine({ session }: { session: BoardSession }): ReactElement | null {
  const dict = useDictionary()
  const { tally } = session
  if (tally.mode === 'view' || tally.board === null) return null
  const text =
    tally.mode === 'inspect'
      ? inspectText(dict, gameOf(tally), tally.inspected)
      : tally.cleared
        ? dict.t('playCleared', tally.mistakes)
        : dict.t('playStatus', dict.fmt(tally.left), tally.mistakes)
  // The full text in `title`: the line is clamped to two lines (`.fw-modetext`).
  // Reset sits outside the status, so a count is announced without it.
  return (
    <div className="fw-modeline" title={text}>
      <span className="fw-modetext" role="status">
        {text}
      </span>
      <button type="button" className="fw-btn" disabled={!progressed(tally)} onClick={session.reset}>
        {dict.t('boardReset')}
      </button>
    </div>
  )
}
