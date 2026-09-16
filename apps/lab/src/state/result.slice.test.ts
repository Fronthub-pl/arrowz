import { beforeEach, expect, test } from 'vitest'
import { decodeBoard } from '@arrowz/engine'
import { finish, finishedRun } from './result.fixtures'
import { storedFixture } from './library.fixtures'
import { useStore } from './store'

const result = () => useStore.getState().result
const ONE = finishedRun(1)
const TWO = finishedRun(2)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

test('a fresh store shows nothing, compares with nothing and has no answer or export error', () => {
  expect(result().shown).toBeNull()
  expect(result().baseline).toBeNull()
  expect(result().saved).toBeNull()
  expect(result().exportError).toBeNull()
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

// An export error used to live in `ExportButtons`, holding the whole replaced
// result so a render could tell it was stale. The next board has failed nothing.
test('show clears the export error of the board before', () => {
  finish(ONE)
  result().exported(ONE.file, 'the codec refused it')
  expect(result().exportError).toBe('the codec refused it')
  finish(TWO)
  expect(result().exportError).toBeNull()
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

// The same guard for an SVG worker still drawing the board before.
test('an export error for a file no longer shown is dropped, and null clears one that is', () => {
  finish(ONE)
  finish(TWO)
  result().exported(ONE.file, 'late')
  expect(result().exportError).toBeNull()
  result().exported(TWO.file, 'on time')
  expect(result().exportError).toBe('on time')
  result().exported(TWO.file, null)
  expect(result().exportError).toBeNull()
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
  result().exported(TWO.file, 'y')
  result().reset()
  expect(result().shown).toBeNull()
  expect(result().baseline).toBeNull()
  expect(result().saved).toBeNull()
  expect(result().exportError).toBeNull()
})

// Spec §5.3: the stored board is a second field, not a second source. A meta
// cannot fill a ReportInput, and the run's own product must survive a trip to
// the library — that is what makes coming back free.
test('a preview leaves the run result, its answer and its baseline alone', () => {
  const state = useStore.getState()
  state.result.reset()
  finish(finishedRun(1))
  const shownBefore = useStore.getState().result.shown
  const { meta, file } = storedFixture(3)

  useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta })

  const after = useStore.getState().result
  expect(after.preview?.meta.id).toBe(meta.id)
  expect(after.shown).toBe(shownBefore)
})

test('clearing the preview leaves the run result where it was', () => {
  const state = useStore.getState()
  state.result.reset()
  finish(finishedRun(1))
  const { meta, file } = storedFixture(3)
  useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta })

  useStore.getState().result.clearPreview()

  expect(useStore.getState().result.preview).toBeNull()
  expect(useStore.getState().result.shown).not.toBeNull()
})

// A finished run must not silently take a preview's place on the stage: the
// stage picks by route, and the two fields are independent.
test('a finished run does not clear a preview', () => {
  const state = useStore.getState()
  state.result.reset()
  const { meta, file } = storedFixture(3)
  state.result.showPreview({ board: decodeBoard(file), file, meta })
  finish(finishedRun(2))
  expect(useStore.getState().result.preview?.meta.id).toBe(meta.id)
})

test('reset clears both the result and the preview', () => {
  const state = useStore.getState()
  const { meta, file } = storedFixture(3)
  state.result.showPreview({ board: decodeBoard(file), file, meta })
  finish(finishedRun(1))
  useStore.getState().result.reset()
  expect(useStore.getState().result.shown).toBeNull()
  expect(useStore.getState().result.preview).toBeNull()
})
