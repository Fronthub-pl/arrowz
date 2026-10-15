import { expect, test } from 'vitest'
import { fillLimit, mayHandOut } from './fill'
import { SEED_CEILING } from './seeds'

test('the seed limit is the one asked for, cut at the seed ceiling', () => {
  expect(fillLimit(1, 20)).toBe(20)
  expect(fillLimit(SEED_CEILING - 4, 20)).toBe(5)
  expect(fillLimit(SEED_CEILING, 20)).toBe(1)
})

test('a seed goes out only while more boards are wanted than are written or in flight, within the limit', () => {
  const at = (written: number, inFlight: number, handedOut: number) =>
    mayHandOut({ wanted: 3, limit: 6, written, inFlight, handedOut })
  expect(at(0, 2, 2)).toBe(true)
  expect(at(0, 3, 3)).toBe(false)
  expect(at(1, 2, 3)).toBe(false)
  expect(at(2, 0, 5)).toBe(true)
  expect(at(2, 0, 6)).toBe(false)
  expect(at(3, 0, 4)).toBe(false)
})
