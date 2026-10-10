import { storeRequest } from '@fronthub/arrowz-engine/command'
import { exportCell } from '@fronthub/arrowz-engine/simple'
import { saveBoard } from '../api/boards'
import type { ShownResult } from '../state/result.slice'
import { type Store, useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { refreshLibrary } from './useLibraryList'

/** Why Save board is off, as a dictionary key; each is also the button's title. */
export type SaveRefusal = 'saveNoBoard' | 'saveStopped' | 'savePending' | 'saveDone'

/**
 * Save board's rule. A stopped board is a look at where a run got to, not a
 * board to keep. A failed save is not refused: it can be tried again, except a
 * stale answer, where an older store server did save the board.
 */
export function saveRefusal(state: Store): SaveRefusal | null {
  const { shown, saved } = state.result
  if (shown === null) return 'saveNoBoard'
  if (shown.report.aborted) return 'saveStopped'
  if (saved === 'pending') return 'savePending'
  if (saved !== null && (saved.ok || saved.stale === true)) return 'saveDone'
  return null
}

/**
 * Posts `shown` to the store and hands the answer to the result slice, which
 * drops it for a board no longer on screen. `top` zeroed: a saved board is a
 * picture, and the highlight is a reading aid for this run. `cell` comes from
 * the board's size (`exportCell`, as `buildCommand` does), not from the slice,
 * so the preview field a user just set is not overwritten.
 */
export function postShown(shown: ShownResult): void {
  const { file, params, report } = shown
  const view = { ...viewOf(useStore.getState().view), top: 0, cell: exportCell(params.W, params.H) }
  const request = storeRequest(file, params, view, 'lab', {
    ok: report.ok,
    pieces: report.pieces,
    maxLen: report.metrics?.maxLen ?? null,
    genMs: report.genMs,
    restarts: report.restartsUsed,
    backtracks: report.backtracks,
    stuck: report.stuck,
    // Only a finished board is posted: it is never the abort a stored recipe
    // might carry from an earlier, cut-short save.
    aborted: false,
  })
  useStore.getState().result.saving(file)
  void saveBoard(request).then((outcome) => {
    useStore.getState().result.stored(file, outcome)
    // The saved boards tab caches its listing; a stale answer is a board on disk too.
    if (outcome.ok || outcome.stale === true) refreshLibrary()
  })
}

/** Save board and its palette row: the board on screen, unless `saveRefusal` names a reason. */
export function saveShown(): void {
  const state = useStore.getState()
  const shown = state.result.shown
  if (shown === null || saveRefusal(state) !== null) return
  postShown(shown)
}
