import type { BoardSize } from '@arrowz/engine'

/**
 * Which listed size an address is about, and whether the listing really holds
 * it. Both halves of the panel ask this one function, so they cannot answer
 * differently: before PR 5b the list fell back to the first size's rows while
 * the chips, reading the address alone, pressed nothing — the disagreement
 * spec §5.6 settles.
 *
 * `mismatch` is false when the address names no size at all: the rows shown
 * are the first size's, and that size's chip is pressed, because the first
 * size is what is being looked at — nothing was asked for, so there is no
 * disagreement. `mismatch` is true only when the address *names* a size the
 * listing has not got: the rows shown are still the first size's, but no chip
 * is pressed, because none of them is what the address asked for.
 */
export function openEntry(
  sizes: BoardSize[] | null,
  size: string | null,
): { entry: BoardSize | null; mismatch: boolean } {
  if (sizes === null || sizes.length === 0) return { entry: null, mismatch: false }
  const named = size === null ? undefined : sizes.find((entry) => entry.size === size)
  if (named !== undefined) return { entry: named, mismatch: false }
  // A `mismatch` only when the address *named* a size the listing has not got.
  // An address with no size is not a disagreement: the list shows the first
  // size's rows and its chip says so, which is what PR 5a's own case asserts.
  return { entry: sizes[0] ?? null, mismatch: size !== null }
}
