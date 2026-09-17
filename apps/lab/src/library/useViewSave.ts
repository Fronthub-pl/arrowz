import type { BoardFile, View } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { saveBoard } from '../api/boards'
import { useStore } from '../state/store'
import { raiseNotice } from './notices'

/** The old lab's own pause between the last keystroke and the write. */
const SETTLE_MS = 350

/**
 * Module scope, as the old lab keeps `libTimer` (Ruling 12). Not a ref inside
 * the component: the detail is keyed on the address, so choosing another board
 * unmounts it, and a timer owned by that instance would die with the edit. And
 * not an effect either — review round 2 measured a cleanup written to flush
 * such a timer running on *every render*, because its dependencies were fresh
 * functions: the debounce never fired, one edit posted twice, and every later
 * re-render posted again.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Drops a write that has not happened yet. The delete calls this before asking
 * the store to remove the board: measured against a real store, a pending save
 * that survived a delete re-POSTed the board, and `store.ts`'s `saveBoard`
 * treats a board it cannot find as a new one — so the deleted board came back
 * to the disk and to the listing (Rulings 11 and 12).
 */
export function cancelPendingSave(): void {
  clearTimeout(timer)
  timer = undefined
}

/**
 * An edited view of a stored board: the element redraws at once, and after a
 * pause the same board file goes back to the store with the new view in its
 * meta (`onLibViewInput` and `saveLibView` in `lab-page.ts`). Nothing is
 * regenerated, and the command in the meta still reproduces the board.
 */
export function useViewSave(refresh: () => void): (view: View) => void {
  return (view) => {
    useStore.getState().result.previewView(view)
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void write(refresh, view)
    }, SETTLE_MS)
  }
}

async function write(refresh: () => void, posted: View): Promise<void> {
  // The board, the file and the meta's other fields are read now — the timer
  // has just fired and they are what the store should be told about. The view
  // is the caller's, so the write describes the edit rather than whatever the
  // store has moved on to.
  const preview = useStore.getState().result.preview
  if (preview === null) return
  const { meta, file, board } = preview
  const name = `${meta.W}x${meta.H}/${meta.id}`
  // The page holds the file as `unknown` because it reads nothing in it;
  // `decodeBoard` accepted it when it loaded and it goes back untouched, so
  // the contract's `BoardFile` is what it is — the old lab says the same.
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
  // Only the *stage* is gated on identity, and only against putting an older
  // view back on it. Comparing `meta.id` cannot do that job: `layoutHash` reads
  // the layout, not the view, so every save of one board answers with the same
  // id, and round 1 measured an older answer taking a newer edit off the stage
  // and out of the next write. `previewView` stores the caller's object, so a
  // newer edit is a different object.
  //
  // The message and the refresh are NOT gated. Round 2 measured that mistake:
  // a save whose answer arrived after the board changed said nothing at all —
  // no `viewSaved`, no `notSaved` on failure, and a row left showing the
  // command of a view the store no longer holds.
  if (useStore.getState().result.preview?.meta.view === posted) {
    useStore.getState().result.showPreview({ board, file, meta: outcome.meta })
  }
  raiseNotice({ kind: 'viewSaved', name })
  // The store keeps `createdAt` on an overwrite, so the row stays in place; the
  // listing is refreshed for the new meta alone.
  refresh()
}
