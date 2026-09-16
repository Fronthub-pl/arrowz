import { useCallback, useEffect } from 'react'
import { listBoards } from '../api/boards'
import { useStore } from '../state/store'

/**
 * The listing, fetched when the tab is opened and again on demand. The cache is
 * the slice's, as the old lab's `boardsCache` is (`lab-page.ts:826`): coming
 * back to the tab shows what was there, and only a refresh pays for a new
 * listing (Ruling 7).
 *
 * The effect cannot leave a stale answer behind: a `cancelled` flag in its
 * cleanup drops an answer that arrives after the panel is gone, which is also
 * what StrictMode's double-invoked mount effect produces.
 */
export function useLibraryList(): { refresh(): void } {
  // One implementation, used by the mount effect and by Refresh: `dropped` is
  // how the effect cancels, and Refresh never passes one.
  const fetchList = useCallback(async (force: boolean, dropped?: () => boolean) => {
    const { library } = useStore.getState()
    if (!force && library.sizes !== null) return
    library.listing()
    const outcome = await listBoards()
    if (dropped?.() === true) return
    const slice = useStore.getState().library
    if (outcome.ok) slice.listed(outcome.sizes)
    else slice.listFailed(outcome.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchList(false, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [fetchList])

  return { refresh: () => void fetchList(true) }
}
