import type { BoardFile } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { exportCell } from '@arrowz/engine/simple'
import { useEffect, useRef } from 'react'
import { saveBoard } from '../api/boards'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'

/**
 * Saves each shown result once. Subscribes to one field, not the slice, so a
 * progress message does not re-render the shell. The guard keys on the file
 * object's identity, fresh per run even for the same board, so Generate twice
 * with one seed saves twice. It is a ref so it survives StrictMode's
 * double-invoked mount effect. A late answer for a board no longer on screen is
 * dropped by the result slice (`stored` compares the file).
 */
export function useStoreSave() {
  const shown = useStore((state) => state.result.shown)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    if (shown === null || posted.current === shown.file) return
    posted.current = shown.file
    // A stopped board is a look at where a run got to, not a board to keep.
    if (shown.report.aborted) return
    // `top` zeroed: a saved board is a picture, and the highlight is a reading
    // aid for this run. `cell` comes from the board's size (`exportCell`, as
    // `buildCommand` does), not from the slice, so the preview field a user
    // just set is not overwritten.
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
      // An auto-saved run is shown only once it finished: it is never the abort
      // a stored recipe might carry from an earlier, cut-short save.
      aborted: false,
    })
    void saveBoard(request).then((outcome) => useStore.getState().result.stored(file, outcome))
  }, [shown])
}
