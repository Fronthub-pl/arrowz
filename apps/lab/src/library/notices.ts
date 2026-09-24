import type { LibraryNotice } from '../state/library.slice'
import { useStore } from '../state/store'

/** How long a message about something that has finished happening stays up. */
const LINGER_MS = 1200

/**
 * The two notices that describe a state rather than an event. Their own outcome
 * clears them: a fetch that lands, a save that succeeds, a board that is closed.
 */
const KEPT: readonly LibraryNotice['kind'][] = ['loading', 'saveFailed']

/**
 * Module scope, deliberately with no effect and no cleanup: the board column
 * raises `deleted` and then navigates, which unmounts it, so a `clearTimeout`
 * on unmount would leave "Deleted …" up for ever. The timer touches only the
 * store and only takes back its own notice.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Raises a library notice and, for an event, takes it back after `LINGER_MS`,
 * so the status line goes back to describing the board on screen.
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
