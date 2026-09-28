import type { OpenedFile, StoredBoard } from '../state/result.slice'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

export type OpenPreview =
  { origin: 'store'; stored: StoredBoard; size: string } | { origin: 'file'; opened: OpenedFile }

/**
 * The stored board on the stage, when it is the one the address names, with
 * the directory the store listed it under. Null otherwise.
 *
 * Not merely "is there a preview": `useStoredBoard` leaves the previous board
 * on the stage until the next file lands, and a panel must not describe (or
 * delete) the board just clicked away from. The id alone decides, since a
 * layout hash binds the dimensions and the size is only a directory name
 * (`08x08` holds `W` 8). The size is narrowed too: a delete addresses it.
 * A file's preview is the open one only at `FILE_ROUTE`.
 */
export function useOpenPreview(): OpenPreview | null {
  const preview = useStore((state) => state.result.preview)
  const open = useOpenBoard()
  if (preview === null) return null
  if (preview.origin === 'file') return open.file ? { origin: 'file', opened: preview } : null
  if (open.size === null || preview.meta.id !== open.id) return null
  return { origin: 'store', stored: preview, size: open.size }
}
