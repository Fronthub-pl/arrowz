import { beforeEach, expect, test } from 'vitest'
import { finish, finishedRun, stoppedRun } from '../state/result.fixtures'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { saveRefusal } from './saveShown'

const ONE = finishedRun(1)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

test('refuses with no board, then allows the board on screen', () => {
  expect(saveRefusal(useStore.getState())).toBe('saveNoBoard')
  finish(ONE)
  expect(saveRefusal(useStore.getState())).toBeNull()
})

test('refuses a stopped board', () => {
  finish(stoppedRun(1))
  expect(saveRefusal(useStore.getState())).toBe('saveStopped')
})

test('refuses while a save of the board is pending, and once the store said ok', () => {
  finish(ONE)
  useStore.getState().result.saving(ONE.file)
  expect(saveRefusal(useStore.getState())).toBe('savePending')
  useStore
    .getState()
    .result.stored(ONE.file, { ok: true, meta: storedFixture(1).meta, layoutExisted: false, recipeExisted: false })
  expect(saveRefusal(useStore.getState())).toBe('saveDone')
})

// A missing store server is worth a second try.
test('allows a retry after a failed save', () => {
  finish(ONE)
  useStore.getState().result.stored(ONE.file, { ok: false, error: 'no store server' })
  expect(saveRefusal(useStore.getState())).toBeNull()
})
