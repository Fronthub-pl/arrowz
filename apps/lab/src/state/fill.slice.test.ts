import { defaultParams } from '@fronthub/arrowz-engine'
import type { SeedRun } from '@fronthub/arrowz-engine'
import { beforeEach, expect, test } from 'vitest'
import { createFillSlice } from './fill.slice'
import { useStore } from './store'

const fill = () => useStore.getState().fill
const run = (seed: number, outcome: SeedRun['outcome'] = 'complete'): SeedRun => ({
  seed,
  outcome,
  pieces: 1,
  maxLen: 2,
  genMs: 3,
  remaining: outcome === 'complete' ? 0 : 4,
})

beforeEach(() => fill().reset())

test('a fresh slice is idle, wants ten boards and lets the seed limit follow them', () => {
  const fresh = createFillSlice(() => {})
  expect(fresh.phase).toBe('idle')
  expect(fresh.count).toBe(10)
  expect(fresh.maxSeeds).toBeNull()
})

test('the boards are held to 1..200, rounded', () => {
  fill().setCount(0)
  expect(fill().count).toBe(1)
  fill().setCount(999)
  expect(fill().count).toBe(200)
  fill().setCount(12.6)
  expect(fill().count).toBe(13)
})

test('the seed limit is held to 1..400, and twice the boards reads as following them again', () => {
  fill().setMaxSeeds(0)
  expect(fill().maxSeeds).toBe(1)
  fill().setMaxSeeds(9999)
  expect(fill().maxSeeds).toBe(400)
  fill().setMaxSeeds(20)
  expect(fill().maxSeeds).toBeNull()
  fill().setMaxSeeds(30)
  fill().setCount(12)
  expect(fill().maxSeeds).toBe(30)
})

test('a seed limit that becomes twice the boards follows them again', () => {
  fill().setMaxSeeds(30)
  fill().setCount(15)
  expect(fill().maxSeeds).toBeNull()
  fill().setCount(40)
  expect(fill().maxSeeds ?? 2 * fill().count).toBe(80)
})

test('an answer counts as tried and a seed that is not complete is kept in seed order; a stopped one counts for nothing', () => {
  fill().started(defaultParams(), 3, 6)
  fill().answered(run(4, 'incomplete'))
  fill().answered(run(2, 'unsolvable'))
  fill().answered(run(3))
  fill().answered(run(5, 'stopped'))
  expect(fill().tried).toBe(3)
  expect(fill().notComplete).toEqual([2, 4])
})

test('a save counts as written, or as a layout already stored, in seed order', () => {
  fill().started(defaultParams(), 3, 6)
  fill().saved(7, true)
  fill().saved(2, false)
  fill().saved(5, true)
  expect(fill().written).toBe(1)
  expect(fill().alreadyStored).toEqual([5, 7])
})

test('a new batch forgets the last one, its stop and its error, and keeps the fields', () => {
  fill().setCount(4)
  fill().started(defaultParams(), 4, 8)
  fill().saved(1, true)
  fill().stopRequested()
  fill().finished({ kind: 'stale' })
  fill().started(defaultParams(), 4, 8)
  expect(fill()).toMatchObject({
    phase: 'running',
    written: 0,
    tried: 0,
    alreadyStored: [],
    notComplete: [],
    stopping: false,
    error: null,
    count: 4,
    wanted: 4,
    limit: 8,
  })
})

test('finishing ends the phase and keeps the tally and any error', () => {
  fill().started(defaultParams(), 2, 4)
  fill().saved(1, false)
  fill().stopRequested()
  fill().finished({ kind: 'store', message: 'boom' })
  expect(fill()).toMatchObject({
    phase: 'done',
    written: 1,
    stopping: false,
    error: { kind: 'store', message: 'boom' },
  })
})
