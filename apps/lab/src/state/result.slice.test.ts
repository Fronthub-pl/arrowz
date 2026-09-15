import { beforeEach, expect, test } from 'vitest'
import { finish, finishedRun } from './result.fixtures'
import { useStore } from './store'

const result = () => useStore.getState().result
const ONE = finishedRun(1)
const TWO = finishedRun(2)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

test('a fresh store shows nothing, compares with nothing and has no answer', () => {
  expect(result().shown).toBeNull()
  expect(result().baseline).toBeNull()
  expect(result().saved).toBeNull()
})

// The worker's `done` message satisfies `ReportInput` structurally while
// carrying the board file, a multi-megabyte string at Insane (spec §5.3). A
// slice that kept the message would hold a second copy of the file in the
// report, and the baseline a third.
test('show keeps the report fields and not the board file the message carries', () => {
  finish(ONE)
  const shown = result().shown
  expect(shown?.file).toBe(ONE.file)
  expect(shown?.report.pieces).toBe(8)
  expect(shown === null ? true : 'board' in shown.report).toBe(false)
  expect(shown?.report).not.toBe(ONE.report)
})

test('the baseline is the result shown before, without its board', () => {
  finish(ONE)
  expect(result().baseline).toBeNull()
  finish(TWO)
  const baseline = result().baseline
  expect(baseline?.params.seed).toBe(1)
  expect(baseline?.report.metrics?.N).toBe(8)
  expect(baseline === null ? true : 'board' in baseline.report).toBe(false)
})

// The old lab returns before its swap when a run has no metrics
// (lab-page.ts:1425-1429), so the next run is compared with the last run that
// had some.
test('a result without metrics leaves the baseline where it was', () => {
  finish(ONE)
  finish(TWO)
  const bare = finishedRun(3)
  finish({ ...bare, report: { ...bare.report, metrics: null } })
  expect(result().baseline?.params.seed).toBe(2)
  finish(ONE)
  expect(result().baseline?.params.seed).toBe(2)
})

// `started()` used to clear the answer. Without this, the next board would read
// "closed — saved" until its own POST answered.
test('show clears the store answer of the board before', () => {
  finish(ONE)
  result().stored(ONE.file, { ok: false, error: 'no store server' })
  expect(result().saved).not.toBeNull()
  finish(TWO)
  expect(result().saved).toBeNull()
})

// The identity guard App.tsx used to keep, now in the slice: a slow POST for
// the board before must not describe the board on screen.
test('an answer for a file no longer shown is dropped', () => {
  finish(ONE)
  finish(TWO)
  result().stored(ONE.file, { ok: false, error: 'late' })
  expect(result().saved).toBeNull()
  result().stored(TWO.file, { ok: false, error: 'on time' })
  expect(result().saved).toEqual({ ok: false, error: 'on time' })
})

// By identity, not by value: two presses of Generate with the same seed carve
// equal files, and each is its own save.
test('an equal file that is not the shown object is not the shown file', () => {
  finish(ONE)
  result().stored({ ...ONE.file }, { ok: false, error: 'a copy' })
  expect(result().saved).toBeNull()
})

test('reset forgets everything', () => {
  finish(ONE)
  finish(TWO)
  result().stored(TWO.file, { ok: false, error: 'x' })
  result().reset()
  expect(result().shown).toBeNull()
  expect(result().baseline).toBeNull()
  expect(result().saved).toBeNull()
})
