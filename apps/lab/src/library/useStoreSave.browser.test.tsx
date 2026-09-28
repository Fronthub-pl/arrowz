import type { StoreRequest } from '@arrowz/engine'
import { afterEach, beforeEach, expect, type MockInstance, test, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { useStoreSave } from './useStoreSave'

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().run.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The parsed body of the one POST an auto-save sends. */
function posted(fetch: MockInstance<typeof globalThis.fetch>): StoreRequest {
  const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
  return JSON.parse(String(call?.[1]?.body)) as StoreRequest
}

// A fresh run states its own outcome, so it must not keep a stored `aborted`
// from an earlier, cut-short save of the same recipe.
test('a finished run auto-saves with metrics.aborted false', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  finish(finishedRun(1))
  await expect.poll(() => fetch.mock.calls.length).toBeGreaterThan(0)
  expect(posted(fetch).metrics?.aborted).toBe(false)
})
