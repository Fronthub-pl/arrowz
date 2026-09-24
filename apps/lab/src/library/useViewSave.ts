import type { BoardFile, View } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { saveBoard } from '../api/boards'
import type { StoredBoard } from '../state/result.slice'
import { useStore } from '../state/store'
import { raiseNotice } from './notices'

/** The previous lab's own pause between the last keystroke and the write. */
const SETTLE_MS = 350

/**
 * Module scope. Not a ref: the panel is keyed on the address, so choosing
 * another board unmounts it and the timer would die with the edit. Not an
 * effect: a flushing cleanup with fresh-function dependencies runs on every
 * render, so the debounce never fires and each re-render posts again.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Drops a write that has not happened yet. The delete calls this first: the
 * store treats a board it cannot find as new, so a pending save that survived
 * a delete would write the board back to disk. Tests call it between cases,
 * since no unmount stops a module-scope timer.
 */
export function cancelPendingSave(): void {
  clearTimeout(timer)
  timer = undefined
}

/**
 * An edited view of a stored board: the element redraws at once, and after a
 * pause the same board file goes back to the store with the new view in its
 * meta. Nothing is regenerated, and the command in the meta still reproduces
 * the board.
 */
export function useViewSave(refresh: () => void): (view: View) => void {
  return (view) => {
    useStore.getState().result.previewView(view)
    // Captured now, with the edit in its meta: by the time the timer fires the
    // stage may show another board (one click on another row both commits the
    // field and changes the address), and reading it then would send one
    // board's view to another board's file.
    const edited = useStore.getState().result.preview
    if (edited === null) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void write(refresh, edited, view)
    }, SETTLE_MS)
  }
}

async function write(refresh: () => void, edited: StoredBoard, posted: View): Promise<void> {
  // Everything comes from the captured board, never from the stage now: the
  // file this request names decides which board the store overwrites.
  const { meta, file, board } = edited
  const name = `${meta.W}x${meta.H}/${meta.id}`
  // Held as `unknown`; `decodeBoard` accepted it at load, and it goes back untouched.
  const request = storeRequest(file as BoardFile, meta.params, posted, meta.source, {
    ok: meta.ok,
    pieces: meta.pieces,
    maxLen: meta.maxLen,
    genMs: meta.genMs,
  })
  const outcome = await saveBoard(request)
  if (!outcome.ok) {
    raiseNotice({ kind: 'saveFailed' })
    return
  }
  // Only the stage is gated: on the same board (an answer for A must not
  // redraw B) and on the same edit, by identity, since `layoutHash` is
  // view-blind (an older answer must not undo a newer edit). The message and
  // the refresh are not gated: a late answer still reports, and the row must
  // not keep the command of a view the store no longer holds.
  const current = useStore.getState().result.preview
  if (current !== null && current.meta.id === meta.id && current.meta.view === posted) {
    useStore.getState().result.showPreview({ board, file, meta: outcome.meta })
  }
  raiseNotice({ kind: 'viewSaved', name })
  // The store keeps `createdAt` on an overwrite, so the row stays in place; the
  // listing is refreshed for the new meta alone.
  refresh()
}
