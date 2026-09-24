import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { useLibraryList } from './useLibraryList'

beforeEach(() => {
  useStore.getState().library.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * A dropped answer must still end its `loading`. Nothing renders `loading`
 * today, so the store is the only place to see it. The sizes are asserted
 * beside it: ending the wait must not let the stale listing land.
 */
test('an answer that arrives after the panel has gone ends the wait it started', async () => {
  // `null as (() => void) | null`, not `= null`: TypeScript narrows the plain
  // declaration to `null`, misses the assignment inside the executor, and
  // `release?.()` then fails to compile.
  let release = null as (() => void) | null
  const held = new Promise<void>((done) => {
    release = done
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    await held
    return new Response('[]', { status: 200 })
  })

  const view = await renderHook(() => useLibraryList())
  // The precondition: without a wait in flight the case would pass on a hook
  // that never started one.
  await expect.poll(() => useStore.getState().library.loading).toBe(true)

  view.unmount()
  release?.()
  await held
  // A microtask is not enough: the dropped answer is handled after it.
  await new Promise((done) => setTimeout(done, 20))

  expect(useStore.getState().library.loading).toBe(false)
  expect(useStore.getState().library.sizes).toBeNull()
})
