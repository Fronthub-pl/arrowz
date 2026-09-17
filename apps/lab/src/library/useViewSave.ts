import type { BoardFile, View } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { saveBoard } from '../api/boards'
import type { StoredBoard } from '../state/result.slice'
import { useStore } from '../state/store'
import { raiseNotice } from './notices'

/** The previous lab's own pause between the last keystroke and the write. */
const SETTLE_MS = 350

/**
 * Module scope (Ruling 12). Not a ref inside the component: the detail is
 * keyed on the address, so choosing another board
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
 * to the disk and to the listing (Rulings 11 and 12). `harness/mountApp.tsx`'s
 * `resetApp` also calls it, between whole-app test cases, for the same reason
 * `useViewSave.browser.test.tsx`'s `afterEach` does: module scope means no
 * component's unmount stops this timer on its own.
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
    // The board this edit belongs to, captured now — with the edit already in
    // its meta. The timer fires 350 ms later, and by then the stage may be
    // showing a different board: a single click on another row both blurs the
    // field (which commits) and changes the address, and a local store answers
    // well inside the pause. Reading the board at write time therefore sent one
    // board's view to another board's file (measured in this task's review).
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
  // Everything comes from the board that was edited, captured when the edit was
  // committed — never from the stage as it stands now. The stage is a moving
  // target between the keystroke and the timer, and the file this request names
  // decides which board the store overwrites.
  const { meta, file, board } = edited
  const name = `${meta.W}x${meta.H}/${meta.id}`
  // The page holds the file as `unknown` because it reads nothing in it;
  // `decodeBoard` accepted it when it loaded and it goes back untouched, so
  // the contract's `BoardFile` is what it is.
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
  // Only the *stage* is gated, and on two things: that it is still this board,
  // and that it still carries this edit. The board check keeps an answer for A
  // from redrawing B; the view check keeps an older answer from putting its
  // view back over a newer edit — `previewView` stores the caller's object, so
  // a newer edit is a different object, and `layoutHash` is view-blind, so
  // `meta.id` alone cannot tell two saves of one board apart.
  //
  // The message and the refresh are NOT gated. Round 2 measured that mistake:
  // a save whose answer arrived after the board changed said nothing at all —
  // no `viewSaved`, no `saveFailed` on failure, and a row left showing the
  // command of a view the store no longer holds.
  const current = useStore.getState().result.preview
  if (current !== null && current.meta.id === meta.id && current.meta.view === posted) {
    useStore.getState().result.showPreview({ board, file, meta: outcome.meta })
  }
  raiseNotice({ kind: 'viewSaved', name })
  // The store keeps `createdAt` on an overwrite, so the row stays in place; the
  // listing is refreshed for the new meta alone.
  refresh()
}
