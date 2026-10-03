import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { useShownHash } from './useShownHash'

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// The file check in `result.hashed` cannot tell this apart: the board is still
// the one on screen. Only the effect's cleanup drops a hash whose reader is gone.
test('a hash that lands after the hook is unmounted is not written', async () => {
  const ONE = finishedRun(1)
  const held: (() => Promise<void>)[] = []
  const real = crypto.subtle.digest.bind(crypto.subtle)
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(
    (algorithm, data) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        held.push(() => real(algorithm, data).then(resolve, reject))
      }),
  )
  const { unmount } = await renderHook(() => useShownHash())
  await act(async () => finish(ONE))
  await expect.poll(() => held.length).toBe(1)
  await unmount()
  await held[0]?.()
  // The digest's answer still has `layoutHash`'s own `.then` and the hook's to run.
  await new Promise((done) => setTimeout(done, 50))
  expect(useStore.getState().result.hash).toBeNull()
})
