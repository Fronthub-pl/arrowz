import { expect, test } from 'vitest'
import { poolSize, SEED_CEILING, seriesSeeds } from './seeds'

test('the seeds run up from the panel seed', () => {
  expect(seriesSeeds(7, 3)).toEqual([7, 8, 9])
})

test('a series near the ceiling is shorter and never passes it', () => {
  expect(seriesSeeds(SEED_CEILING - 1, 5)).toEqual([SEED_CEILING - 1, SEED_CEILING])
})

test('the pool leaves one core, stops at four, and never exceeds the seeds', () => {
  expect(poolSize(20, 8)).toBe(4)
  expect(poolSize(20, 3)).toBe(2)
  expect(poolSize(2, 8)).toBe(2)
  expect(poolSize(20, 1)).toBe(1)
})
