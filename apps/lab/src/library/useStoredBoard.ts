import { useEffect } from 'react'
import { useStore } from '../state/store'
import { openStoredBoard } from './openStoredBoard'
import { useOpenBoard } from './useOpenBoard'

/**
 * Draws the board the address names (see `openStoredBoard`). The address is
 * the selection, so the slice needs no guard: the effect's cleanup drops an
 * answer that arrives after the address moved or the panel went away (or
 * after StrictMode's first pass).
 */
export function useStoredBoard(): void {
  const { size, id, file } = useOpenBoard()
  const metas = useStore((state) => state.library.sizes)
  useEffect(() => openStoredBoard({ size, id, file }, metas), [size, id, file, metas])
}
