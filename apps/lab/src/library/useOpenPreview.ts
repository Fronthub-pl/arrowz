import type { StoredBoard } from '../state/result.slice'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * The stored board on the stage, when it is the one the address names, with
 * the directory the store listed it under. Null otherwise.
 *
 * Not merely "is there a preview": `useStoredBoard` leaves the previous board
 * on the stage until the next file lands, and a panel must not describe (or
 * delete) the board just clicked away from. The id alone decides, since a
 * layout hash binds the dimensions and the size is only a directory name
 * (`08x08` holds `W` 8). The size is narrowed too: a delete addresses it.
 */
export function useOpenPreview(): { stored: StoredBoard; size: string } | null {
  const preview = useStore((state) => state.result.preview)
  const open = useOpenBoard()
  if (preview === null || open.size === null || preview.meta.id !== open.id) return null
  return { stored: preview, size: open.size }
}
