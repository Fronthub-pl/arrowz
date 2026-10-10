import type { StoreRequest } from '@fronthub/arrowz-engine'
import { act } from 'react'
import { afterEach, beforeEach, expect, type MockInstance, test, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { sizesFixture, storedFixture } from '../state/library.fixtures'
import { finish, finishedRun, stoppedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { postShown, saveShown } from './saveShown'
import { useStoreSave } from './useStoreSave'

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().run.reset()
  useStore.getState().library.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The parsed body of the first POST the spy saw. */
function posted(fetch: MockInstance<typeof globalThis.fetch>): StoreRequest {
  const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
  return JSON.parse(String(call?.[1]?.body)) as StoreRequest
}

/** Every POST the spy saw. */
const posts = (fetch: MockInstance<typeof globalThis.fetch>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'POST')

// A fresh run states its own outcome, so it must not keep a stored `aborted`
// from an earlier, cut-short save of the same recipe.
test('a run that asked to save posts once, with metrics.aborted false', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  await act(async () => finish(finishedRun(1), true))
  await expect.poll(() => posts(fetch).length).toBe(1)
  expect(posted(fetch).metrics?.aborted).toBe(false)
})

// The run after it proves the hook was listening: its POST arrives, the dry run's never did.
test('a dry run is shown and not posted', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  // Each in its own commit: in one, the effect would see only the second.
  await act(async () => finish(finishedRun(1)))
  await act(async () => finish(finishedRun(2), true))
  await expect.poll(() => posts(fetch).length).toBe(1)
  expect(posted(fetch).params.seed).toBe(2)
})

test('a stopped board is not posted even when its run asked', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  await renderHook(() => useStoreSave())
  await act(async () => finish(stoppedRun(1), true))
  await act(async () => finish(finishedRun(2), true))
  await expect.poll(() => posts(fetch).length).toBe(1)
  expect(posted(fetch).params.seed).toBe(2)
})

test('Save board posts the board on screen, with no new run, and once while pending', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  finish(finishedRun(1))
  const shown = useStore.getState().result.shown?.file
  saveShown()
  saveShown()
  expect(posts(fetch)).toHaveLength(1)
  expect(useStore.getState().result.saved).toBe('pending')
  expect(useStore.getState().result.shown?.file).toBe(shown)
  expect(useStore.getState().run.phase).toBe('done')
})

// Save board pressed during a carve: the answer is the old board's, and the new one must not wear it.
test('a late answer for a replaced board is dropped', async () => {
  let answer = (_response: Response) => {}
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise<Response>((done) => {
        answer = done
      }),
  )
  finish(finishedRun(1))
  saveShown()
  finish(finishedRun(2))
  answer(new Response('{}', { status: 201 }))
  await new Promise((done) => setTimeout(done, 50))
  expect(useStore.getState().result.saved).toBeNull()
})

test('postShown posts the board it is handed', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  finish(finishedRun(3))
  const shown = useStore.getState().result.shown
  if (shown === null) throw new Error('no board on screen')
  postShown(shown)
  expect(posted(fetch).params.seed).toBe(3)
})

/** A store whose POST answers `save` and whose listing is `sizesFixture`; GETs are counted. */
function storeAnswering(save: () => Response): MockInstance<typeof globalThis.fetch> {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) =>
      init?.method === 'POST' ? save() : new Response(JSON.stringify(sizesFixture()), { status: 200 }),
    )
}

const lists = (fetch: MockInstance<typeof globalThis.fetch>) =>
  fetch.mock.calls.filter(([, init]) => init?.method !== 'POST')

// The listing the saved boards tab cached before the save: it must not outlive a board the store took.
test('a save the store took lists the saved boards again', async () => {
  useStore.getState().library.listed([])
  const fetch = storeAnswering(
    () =>
      new Response(JSON.stringify({ meta: storedFixture(1).meta, layoutExisted: false, recipeExisted: false }), {
        status: 201,
      }),
  )
  finish(finishedRun(1))
  saveShown()
  await expect.poll(() => useStore.getState().library.sizes?.length).toBe(2)
  expect(lists(fetch)).toHaveLength(1)
})

test('a save the store refused keeps the cached listing', async () => {
  useStore.getState().library.listed([])
  const fetch = storeAnswering(() => new Response('{"error":"disk full"}', { status: 500 }))
  finish(finishedRun(1))
  saveShown()
  await expect.poll(() => useStore.getState().result.saved).not.toBe('pending')
  // The refresh would be one more `.then` down the chain: give it time to show up.
  await new Promise((done) => setTimeout(done, 50))
  expect(lists(fetch)).toHaveLength(0)
  expect(useStore.getState().library.sizes).toEqual([])
})
