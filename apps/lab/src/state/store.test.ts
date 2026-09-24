import { beforeEach, expect, test } from 'vitest'
import { finish, finishedRun } from './result.fixtures'
import { useStore } from './store'

const ONE = finishedRun(1)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  useStore.getState().params.reset()
})

// One `set`, so no render sees `phase: 'done'` beside the previous board.
test('completeRun writes the run and the result in one update', () => {
  useStore.getState().run.started(ONE.params)
  let updates = 0
  const stop = useStore.subscribe(() => void updates++)
  try {
    useStore.getState().completeRun(ONE)
  } finally {
    stop()
  }
  expect(updates).toBe(1)
  expect(useStore.getState().run.phase).toBe('done')
  expect(useStore.getState().result.shown?.file).toBe(ONE.file)
})

test('starting the next run leaves the result on screen', () => {
  finish(ONE)
  useStore.getState().run.started({ ...ONE.params, seed: 2 })
  expect(useStore.getState().run.phase).toBe('running')
  expect(useStore.getState().result.shown?.file).toBe(ONE.file)
})

test('the result carries the parameters the run was started with, not the knobs on screen', () => {
  useStore.getState().run.started(ONE.params)
  useStore.getState().params.setMany({ W: 30 })
  useStore.getState().completeRun(ONE)
  expect(useStore.getState().result.shown?.params.W).toBe(8)
})

test('a store failure leaves the run done', () => {
  finish(ONE)
  useStore.getState().result.stored(ONE.file, { ok: false, error: 'no store server' })
  expect(useStore.getState().run.phase).toBe('done')
  expect(useStore.getState().result.saved).toEqual({ ok: false, error: 'no store server' })
})

// No parameters to show the board under, and none may be invented.
test('a run that was never started cannot be completed', () => {
  expect(() => useStore.getState().completeRun(ONE)).toThrow(/never started/)
  expect(useStore.getState().result.shown).toBeNull()
})
