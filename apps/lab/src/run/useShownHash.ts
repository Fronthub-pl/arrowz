import { layoutHash } from '@fronthub/arrowz-engine'
import { useEffect } from 'react'
import { useStore } from '../state/store'

/**
 * Works out the layout hash of each shown board once, for every reader: the
 * board file's name (`ExportButtons`) and the dry run of a stored board
 * (`useRunLine`). Mounted in `App`. A hash for a board no longer shown is
 * dropped by `result.hashed`, which keys on the file object; the cleanup drops
 * one whose effect is gone — StrictMode's first mount run, or an unmount.
 */
export function useShownHash(): void {
  const shown = useStore((state) => state.result.shown)
  useEffect(() => {
    if (shown === null) return
    let ignore = false
    const { file, board } = shown
    const hashed = useStore.getState().result.hashed
    layoutHash(board).then(
      (value) => {
        if (!ignore) hashed(file, value, null)
      },
      (reason: unknown) => {
        if (!ignore) hashed(file, null, reason instanceof Error ? reason.message : String(reason))
      },
    )
    return () => {
      ignore = true
    }
  }, [shown])
}
