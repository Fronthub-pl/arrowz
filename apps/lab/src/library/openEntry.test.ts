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
  // Not a mismatch: nothing was asked for, so the first size's tab stays selected.
  expect(found.mismatch).toBe(false)
})

test('a size the store does not list falls back, and says so', () => {
  const found = openEntry(SIZES, '10x10')
  expect(found.entry?.size).toBe('8x8')
  expect(found.mismatch).toBe(true)
})

test('an empty store has no entry at all', () => {
  expect(openEntry([], '8x8')).toEqual({ entry: null, mismatch: false })
  expect(openEntry(null, '8x8')).toEqual({ entry: null, mismatch: false })
})
