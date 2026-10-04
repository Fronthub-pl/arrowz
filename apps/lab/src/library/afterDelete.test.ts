import { expect, test } from 'vitest'
import { sizesFixture, storedFixture } from '../state/library.fixtures'
import { addressAfterDelete } from './afterDelete'

// 8x8 lists seed 2, then seed 1; 6x6 lists seed 3.
const SIZES = sizesFixture()
const [one, two, three] = [storedFixture(1).meta.id, storedFixture(2).meta.id, storedFixture(3, 6, 6).meta.id]

test('opens the row below the deleted one', () => {
  expect(addressAfterDelete(SIZES, '8x8', two)).toBe(`/boards/8x8/${one}`)
})

test('opens the row above when the last row went', () => {
  expect(addressAfterDelete(SIZES, '8x8', one)).toBe(`/boards/8x8/${two}`)
})

test('opens the first board of the next listed size when the size is emptied', () => {
  expect(addressAfterDelete(SIZES, '6x6', three)).toBe(`/boards/8x8/${two}`)
})

test('falls back to the list when nothing is left', () => {
  const [eight] = SIZES
  if (eight === undefined) throw new Error('no 8x8 in the fixture')
  expect(addressAfterDelete([{ ...eight, boards: eight.boards.slice(0, 1) }], '8x8', two)).toBe('/boards')
  expect(addressAfterDelete(null, '8x8', two)).toBe('/boards')
})

// A listing from before the board was saved does not hold it: stay in its size.
test('a board the listing has not got opens its size’s first board', () => {
  expect(addressAfterDelete(SIZES, '8x8', 'sha256-unlisted')).toBe(`/boards/8x8/${two}`)
})
