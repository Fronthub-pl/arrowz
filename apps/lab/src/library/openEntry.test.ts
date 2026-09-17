import { expect, test } from 'vitest'
import { sizesFixture } from '../state/library.fixtures'
import { openEntry } from './openEntry'

// One instance, held: `sizesFixture()` carves real boards, so two calls differ
// in `genMs` and a `toEqual` between them could never pass.
const SIZES = sizesFixture()

test('the address names a listed size', () => {
  expect(openEntry(SIZES, '6x6')).toEqual({ entry: SIZES[1], mismatch: false })
})

test('no size in the address falls back to the first, and says it is a fallback', () => {
  const found = openEntry(SIZES, null)
  expect(found.entry?.size).toBe('8x8')
  // Not a mismatch: nothing was asked for, so the first size's chip is the one
  // that describes the rows being shown. PR 5a's own case asserts it is pressed,
  // and review round 2 caught the first draft of this function breaking that.
  expect(found.mismatch).toBe(false)
})

// The disagreement PR 5a's review found: the list fell back to the first size's
// rows while no chip was pressed, so the two halves of the panel described
// different sizes. One function, one answer (spec §5.6).
test('a size the store does not list falls back, and says so', () => {
  const found = openEntry(SIZES, '10x10')
  expect(found.entry?.size).toBe('8x8')
  expect(found.mismatch).toBe(true)
})

test('an empty store has no entry at all', () => {
  expect(openEntry([], '8x8')).toEqual({ entry: null, mismatch: false })
  expect(openEntry(null, '8x8')).toEqual({ entry: null, mismatch: false })
})
