import type { StoredBoard } from '../state/result.slice'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * The stored board on the stage, when it is the one the address names, with
 * the directory the store listed it under. Null otherwise.
 *
 * Not merely "is there a preview" (Ruling 15): `useStoredBoard` leaves the
 * board before this one on the stage until the next file lands, and in that
 * window a panel would describe — and offer to delete — the board just clicked
 * away from. The id alone decides: a layout hash already binds the board to its
 * dimensions, while the size is a directory name (a folder called `08x08`
 * lists boards whose `W` is 8). The size is narrowed here too, because a delete
 * addresses the board by that directory and must not invent one.
 */
export function useOpenPreview(): { stored: StoredBoard; size: string } | null {
  const preview = useStore((state) => state.result.preview)
  const open = useOpenBoard()
  if (preview === null || open.size === null || preview.meta.id !== open.id) return null
  return { stored: preview, size: open.size }
}
