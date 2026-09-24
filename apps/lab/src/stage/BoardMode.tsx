import type {
  ArrowzBoard,
  FinishedEvent,
  LifeLostEvent,
  PieceClickEvent,
  PieceRemovedEvent,
} from '@arrowz/board-element'
import { type BoardData, newSession, type Session } from '@arrowz/engine'
import type { Dict } from '@arrowz/engine/i18n'
import { type ReactElement, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { Segmented } from '../shell/Segmented'
import { useStore } from '../state/store'
import type { BoardMode } from '../state/ui.slice'
import { pieceFacts } from './pieceFacts'

/** The engine's `DIRS` glyphs, which `@arrowz/engine` does not export; indexed by `Piece.dir`. */
const GLYPHS = ['↑', '→', '↓', '←'] as const
const DIR_WORDS = ['dirUp', 'dirRight', 'dirDown', 'dirLeft'] as const

/** What the frame's line knows about the board on stage, for one board in one mode. */
interface Tally {
  board: BoardData | null
  mode: BoardMode
  inspected: number | null
  left: number
  mistakes: number
  cleared: boolean
}

function fresh(board: BoardData | null, mode: BoardMode): Tally {
  return { board, mode, inspected: null, left: board?.pieces.length ?? 0, mistakes: 0, cleared: false }
}

export interface BoardSession {
  tally: Tally
  onPieceClick(event: PieceClickEvent): void
  onPieceRemoved(event: PieceRemovedEvent): void
  onLifeLost(event: LifeLostEvent): void
  onFinished(event: FinishedEvent): void
  restart(): void
}

/**
 * The counts and the inspected piece, keyed by the board on stage and the
 * mode: either changing starts them over, adjusted while rendering rather
 * than in an effect. Leaving Play also puts the element's pieces back, so
 * View and Inspect draw the whole board the inspect card describes; entering
 * it needs nothing, the element's game being whole already. `restart()`
 * only, never `loadState`, which would give the element a colour of its own.
 */
export function useBoardSession(
  board: BoardData | null,
  mode: BoardMode,
  element: RefObject<ArrowzBoard | null>,
): BoardSession {
  const [stored, setTally] = useState(() => fresh(board, mode))
  let tally = stored
  if (stored.board !== board || stored.mode !== mode) {
    tally = fresh(board, mode)
    setTally(tally)
  }
  const played = useRef(mode === 'play')
  useEffect(() => {
    if (played.current && mode !== 'play') element.current?.restart()
    played.current = mode === 'play'
  }, [mode, element])
  return {
    tally,
    onPieceClick: (event) => {
      if (mode === 'inspect') setTally((t) => ({ ...t, inspected: event.detail.pieceId }))
    },
    onPieceRemoved: (event) => setTally((t) => ({ ...t, left: event.detail.left })),
    onLifeLost: () => setTally((t) => ({ ...t, mistakes: t.mistakes + 1 })),
    // `finished` trails the last exit animation, so a Restart or a new board
    // can land first; only a tally with nothing left may read as cleared.
    onFinished: () => setTally((t) => (t.left === 0 ? { ...t, cleared: true } : t)),
    restart: () => {
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
 * game's counts with Restart. Nothing in View.
 */
export function BoardModeLine({ session }: { session: BoardSession }): ReactElement | null {
  const dict = useDictionary()
  const { tally } = session
  // Once per board, not per click, and only where the card reads it:
  // `newSession` indexes every piece.
  const inspected = tally.mode === 'inspect' ? tally.board : null
  const game = useMemo(() => (inspected === null ? null : newSession(inspected)), [inspected])
  if (tally.mode === 'view' || tally.board === null) return null
  if (tally.mode === 'inspect') {
    return (
      <div className="fw-modeline" role="status">
        {inspectText(dict, game, tally.inspected)}
      </div>
    )
  }
  return (
    <div className="fw-modeline">
      <span role="status">
        {tally.cleared
          ? dict.t('playCleared', tally.mistakes)
          : dict.t('playStatus', dict.fmt(tally.left), tally.mistakes)}
      </span>
      <button type="button" className="fw-btn" onClick={session.restart}>
        {dict.t('playRestart')}
      </button>
    </div>
  )
}
