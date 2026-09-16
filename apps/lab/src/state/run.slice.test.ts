import { defaultParams } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { finishedRun } from './result.fixtures'
import { useStore } from './store'

const params = { ...defaultParams(), W: 8, H: 8, seed: 1 }
const run = () => useStore.getState().run

beforeEach(() => {
  run().reset()
  useStore.getState().result.reset()
})

test('a fresh store is idle and holds no parameters', () => {
  expect(run().phase).toBe('idle')
  expect(run().params).toBeNull()
})

test('started moves to running and pins the parameters the run uses', () => {
  run().started(params)
  expect(run().phase).toBe('running')
  expect(run().params).toEqual(params)
  expect(run().progress).toBeNull()
})

test('progress is kept while running and dropped when the run ends', () => {
  run().started(params)
  // TraceInfo, as types.ts:40-46 declares it.
  run().progressed({ pieces: 3, remaining: 40, backtracks: 0, ms: 12, total: 64 })
  expect(run().progress?.remaining).toBe(40)
  useStore.getState().completeRun(finishedRun(1))
  expect(run().progress).toBeNull()
  expect(run().phase).toBe('done')
})

test('failed carries the message', () => {
  run().started(params)
  run().failed('the envelope refuses these parameters')
  expect(run().phase).toBe('error')
  expect(run().message).toBe('the envelope refuses these parameters')
})

test('aborting a run returns to idle without an error', () => {
  run().started(params)
  run().aborted()
  expect(run().phase).toBe('idle')
  expect(run().message).toBeNull()
})

// An abort and a fresh page are both idle, and the status line has to tell
// them apart: the old lab prints `aborted`, not `pressGenerate`.
test('aborting records that it happened, and the next run forgets it', () => {
  run().started(params)
  run().aborted()
  expect(run().wasAborted).toBe(true)
  run().started(params)
  expect(run().wasAborted).toBe(false)
})

// The other half of the distinction, and the reason `aborted()` and `reset()`
// are not the same function: a reset is the opening state, not an abort.
test('reset does not record an abort', () => {
  run().started(params)
  run().aborted()
  run().reset()
  expect(run().wasAborted).toBe(false)
})
