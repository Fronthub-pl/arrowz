import { layoutHash } from '@arrowz/engine'
import { useEffect } from 'react'
import { useStore } from '../state/store'

/**
 * Works out the layout hash of each shown board once, for every reader: the
 * board file's name (`ExportButtons`) and the dry run of a stored board
 * (`useRunLine`). Mounted in `App`. An answer for a board no longer shown —
 * a slow hash landing after a newer one, or StrictMode's first mount run — is
 * dropped by `result.hashed`, which keys on the file object.
 */
export function useShownHash(): void {
  const shown = useStore((state) => state.result.shown)
  useEffect(() => {
    if (shown === null) return
    const { file, board } = shown
    const hashed = useStore.getState().result.hashed
    layoutHash(board).then(
      (value) => hashed(file, value, null),
      (reason: unknown) => hashed(file, null, reason instanceof Error ? reason.message : String(reason)),
    )
  }, [shown])
}
