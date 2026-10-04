import type { BoardSize } from '@arrowz/engine'

/**
 * Where a delete lands, read off the listing as it stood before the delete: the
 * row that moves up into the deleted one's place, else the row above it, else
 * the first board of another size, else the bare list. A board the listing has
 * not got yet counts as its size's first row.
 */
export function addressAfterDelete(sizes: BoardSize[] | null, size: string, id: string): string {
  const entry = sizes?.find((listed) => listed.size === size)
  if (entry !== undefined) {
    const at = Math.max(0, entry.boards.findIndex((meta) => meta.id === id))
    const rest = entry.boards.filter((meta) => meta.id !== id)
    const next = rest[at] ?? rest[at - 1]
    if (next !== undefined) return `/boards/${entry.size}/${next.id}`
  }
  for (const other of sizes ?? []) {
    const first = other.boards[0]
    if (other.size !== size && first !== undefined) return `/boards/${other.size}/${first.id}`
  }
  return '/boards'
}
