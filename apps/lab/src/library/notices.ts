import type { LibraryNotice } from '../state/library.slice'
import { useStore } from '../state/store'

/** How long a message about something that has finished happening stays up. */
const LINGER_MS = 1200

/**
 * The two notices that describe a state rather than an event (Ruling 5). Their
 * own outcome clears them: a fetch that lands, a save that succeeds, a board
 * that is closed.
 */
const KEPT: readonly LibraryNotice['kind'][] = ['loading', 'saveFailed']

/**
 * Module scope, not a ref, and there is deliberately no effect and no cleanup.
 * Review round 2 measured the alternative: a `clearTimeout` on unmount killed
 * the `deleted` notice's own timer, because the detail raises that notice and
 * then navigates — which unmounts the detail — so the line said "Deleted …"
 * for ever. This timer touches only the store and only takes back the object it
 * put up, so an unmounted raiser costs nothing at all.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Raises a library notice, and takes it back 1200 ms later when what it reports
 * is over (Ruling 5), so the status line goes back to describing the board on
 * screen rather than keeping a sentence about something that has finished.
 */
export function raiseNotice(notice: LibraryNotice): void {
  useStore.getState().library.notify(notice)
  clearTimeout(timer)
  timer = undefined
  if (KEPT.includes(notice.kind)) return
  timer = setTimeout(() => {
    // Only take back the message this call put up: a newer one is someone
    // else's, and its own timer will see to it.
    if (useStore.getState().library.notice === notice) useStore.getState().library.clearNotice()
  }, LINGER_MS)
}

/** For tests, which must not leak a pending fade into the case after them. */
export function cancelNoticeFade(): void {
  clearTimeout(timer)
  timer = undefined
}
