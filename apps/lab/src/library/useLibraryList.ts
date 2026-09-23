import { useEffect } from 'react'
import { listBoards } from '../api/boards'
import { useStore } from '../state/store'

/**
 * The listing, fetched when the tab is opened and again on demand. The cache is
 * the slice's: coming back to the tab shows what was there, and only a refresh
 * pays for a new listing (Ruling 7).
 *
 * The effect cannot leave a stale answer behind: a `cancelled` flag in its
 * cleanup drops an answer that arrives after the panel is gone, which is also
 * what StrictMode's double-invoked mount effect produces.
 */
async function fetchList(force: boolean, dropped?: () => boolean): Promise<void> {
  const { library } = useStore.getState()
  if (!force && library.sizes !== null) return
  library.listing()
  const outcome = await listBoards()
  // The answer is still dropped — it must not land on a panel that has gone —
  // but the wait it belongs to ends here all the same. Returning outright left
  // the `loading` this call had just set true for good: latent while nothing
  // renders it, and inherited by the first thing that does.
  if (dropped?.() === true) {
    useStore.getState().library.listDropped()
    return
  }
  const slice = useStore.getState().library
  if (outcome.ok) slice.listed(outcome.sizes)
  else slice.listFailed(outcome.error)
}

/**
 * A new listing, whatever the cache holds: Refresh, and what a delete or a
 * view save leaves behind. A module function rather than the hook's, so the
 * drawer's list and the right column can both ask without either mounting the
 * fetch-on-mount a second time (handoff 2, PR 6).
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
