import type { BoardSize } from '@arrowz/engine'

/**
 * Which listed size an address is about, and whether the listing holds it. The
 * rail and the list both ask this one function, so they cannot disagree.
 * Either way the first size's rows are shown when the address names no listed
 * size; `mismatch` is true only when it *named* one the listing has not got, and
 * then no size tab is selected.
 */
export function openEntry(
  sizes: BoardSize[] | null,
  size: string | null,
): { entry: BoardSize | null; mismatch: boolean } {
  if (sizes === null || sizes.length === 0) return { entry: null, mismatch: false }
  const named = size === null ? undefined : sizes.find((entry) => entry.size === size)
  if (named !== undefined) return { entry: named, mismatch: false }
  return { entry: sizes[0] ?? null, mismatch: size !== null }
}
