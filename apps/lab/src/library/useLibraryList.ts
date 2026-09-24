import { useEffect } from 'react'
import { listBoards } from '../api/boards'
import { useStore } from '../state/store'

/**
 * The listing, fetched when the tab is opened and again on demand. The slice
 * caches it: coming back to the tab shows what was there, and only a refresh
 * pays for a new listing. An answer that arrives after the panel is gone (or
 * after StrictMode's first mount pass) is dropped via `dropped`.
 */
async function fetchList(force: boolean, dropped?: () => boolean): Promise<void> {
  const { library } = useStore.getState()
  if (!force && library.sizes !== null) return
  library.listing()
  const outcome = await listBoards()
  // A dropped answer still ends the wait: returning outright would leave this
  // call's `loading` true for good, inherited by the next thing to render it.
  if (dropped?.() === true) {
    useStore.getState().library.listDropped()
    return
  }
  const slice = useStore.getState().library
  if (outcome.ok) slice.listed(outcome.sizes)
  else slice.listFailed(outcome.error)
}

/**
 * A new listing, whatever the cache holds: Refresh, and after a delete or a
 * view save. A module function, so the drawer's list and the right column can
 * both ask without mounting the fetch-on-mount a second time.
 */
export function refreshLibrary(): void {
  void fetchList(true)
}

/**
 * Mounted once, by the saved boards' console: its guard only stops a second
 * fetch after an answer has arrived, so two callers against an empty cache
 * would both fetch.
 */
export function useLibraryList(): { refresh(): void } {
  useEffect(() => {
    let cancelled = false
    void fetchList(false, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [])

  return { refresh: refreshLibrary }
}
