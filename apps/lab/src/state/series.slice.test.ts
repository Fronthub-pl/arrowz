import { defaultParams } from '@arrowz/engine'
import type { SeedRun } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'

const series = () => useStore.getState().series
const run = (seed: number): SeedRun => ({ seed, outcome: 'complete', pieces: 1, maxLen: 2, genMs: 3, remaining: 0 })

beforeEach(() => series().reset())

test('a fresh slice is idle with the default count', () => {
  expect(series().phase).toBe('idle')
  expect(series().count).toBe(20)
})

test('the count is held to its range', () => {
  series().setCount(1)
  expect(series().count).toBe(2)
  series().setCount(999)
  expect(series().count).toBe(200)
  series().setCount(12.6)
  expect(series().count).toBe(13)
})

test('answers are kept in seed order whatever order they arrive in', () => {
  series().started({ ...defaultParams(), seed: 10 }, 3)
  series().answered(run(12))
  series().answered(run(10))
  series().answered(run(11))
  expect(series().runs.map((r) => r.seed)).toEqual([10, 11, 12])
})

test('a new series forgets the last one and its stop', () => {
  series().started(defaultParams(), 2)
  series().answered(run(1))
  series().stopRequested()
  series().started(defaultParams(), 2)
  expect(series().runs).toEqual([])
  expect(series().stopping).toBe(false)
  expect(series().phase).toBe('running')
})

test('finishing ends the phase and keeps the runs and any error', () => {
  series().started(defaultParams(), 2)
  series().answered(run(1))
  series().finished('boom')
  expect(series().phase).toBe('done')
  expect(series().runs).toHaveLength(1)
  expect(series().error).toBe('boom')
})
