import type { BoardFile } from '@arrowz/engine'
import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { postShown } from './saveShown'

/**
 * Saves each shown result whose run asked for it (the switch, ⌘G) once.
 * Subscribes to one field, not the slice, so a progress message does not
 * re-render the shell. The guard keys on the file object's identity, fresh per
 * run even for the same board, so two saved runs of one seed save twice. It is
 * a ref so it survives StrictMode's double-invoked mount effect.
 */
export function useStoreSave() {
  const shown = useStore((state) => state.result.shown)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    if (shown === null || posted.current === shown.file) return
    posted.current = shown.file
    // A stopped board is a look at where a run got to, not a board to keep.
    if (!shown.save || shown.report.aborted) return
    postShown(shown)
  }, [shown])
}
