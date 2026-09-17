import { decodeBoard } from '@arrowz/engine'
import { act, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { userEvent } from 'vitest/browser'
import { render, renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { cancelPendingSave, useViewSave } from './useViewSave'

const stored = storedFixture(1)
const at = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/boards']}>{children}</MemoryRouter>
)

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// The boundary itself. Fake timers go in after `renderHook` and without
// `shouldAdvanceTime`, and every assertion is a bare `expect` — `expect.element`
// stands on `expect.poll` and would hang on a frozen clock.
test('the store is written 350 ms after the last edit, not before', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  vi.useFakeTimers()

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  // The picture moves at once; only the store waits.
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(0.8)
  await act(async () => await vi.advanceTimersByTimeAsync(349))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await act(async () => await vi.advanceTimersByTimeAsync(1))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

// Review round 2, and the reason this case cannot use `renderHook`: that host
// subscribes to nothing, so it never re-renders, and the defect this pins —
// an effect whose cleanup ran per render, killing the debounce and posting on
// every later render — was invisible to every other case in this file.
test('an edit posts once, whatever the owner re-renders in between', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  function Owner() {
    // Selecting the state the hook writes is the whole point: this is what
    // `BoardDetail` does, and what makes the re-renders real.
    const stroke = useStore((state) => state.result.preview?.meta.view.stroke)
    const commit = useViewSave(() => {})
    const [bumps, bump] = useState(0)
    return (
      <div>
        <button type="button" onClick={() => commit({ ...stored.meta.view, stroke: 0.8 })}>
          edit
        </button>
        <button type="button" onClick={() => bump(bumps + 1)}>
          bump
        </button>
        <span>{`${String(stroke)} ${bumps}`}</span>
      </div>
    )
  }
  const screen = await render(
    <MemoryRouter initialEntries={['/boards']}>
      <Owner />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'edit' }))
  await userEvent.click(screen.getByRole('button', { name: 'bump' }))
  await userEvent.click(screen.getByRole('button', { name: 'bump' }))
  // Real timers, and a wait long enough for the debounce twice over: polling
  // for "exactly one" would pass the moment the first arrived.
  await new Promise((done) => setTimeout(done, 800))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

// Ruling 12: the timer is the module's, so it survives the detail being
// unmounted — and `cancelPendingSave` is the one thing that stops it.
test('a cancelled save never reaches the store', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  cancelPendingSave()
  await new Promise((done) => setTimeout(done, 600))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

// Round 2: the identity guard used to swallow the message as well as the
// stage write, so a save that landed after the board changed said nothing at
// all — and the row kept the command of a view the store no longer held.
test('a save that lands after the board changed still reports itself', async () => {
  const saved = { ...stored.meta, view: { ...stored.meta.view, stroke: 0.8 } }
  // The POST is held open, and that is the whole point: clearing the preview
  // *before* the timer fires would make `write()` return on `preview === null`
  // and nothing would ever be posted — review round 3 measured the first
  // version of this case failing that way against correct code, which means it
  // pinned nothing.
  let release = (_: Response) => {}
  const held = new Promise<Response>((resolve) => (release = resolve))
  const posts = vi.spyOn(globalThis, 'fetch').mockReturnValue(held)
  let refreshed = 0
  const { result } = await renderHook(() => useViewSave(() => (refreshed += 1)), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => posts.mock.calls.filter(([, init]) => init?.method === 'POST').length).toBe(1)

  // Now the stage moves on, exactly as choosing another board does — while the
  // answer is still in flight.
  await act(async () => useStore.getState().result.clearPreview())
  await act(async () => release(new Response(JSON.stringify(saved), { status: 201 })))

  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('viewSaved')
  expect(refreshed).toBe(1)
  // And the board that replaced it is not overwritten by the answer.
  expect(useStore.getState().result.preview).toBeNull()
})

// Ruling 5, the half no timer takes back: a refusal describes the state of the
// stage against the store, so it stays until a save lands or another board is
// opened. Round 3 found nothing pinning it.
test('a failed save keeps saying so, because the picture still disagrees with the store', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('saveFailed')
  // Past the 1200 ms fade the other three notices take.
  await new Promise((done) => setTimeout(done, 1500))
  expect(useStore.getState().library.notice?.kind).toBe('saveFailed')
})

test('a burst of edits writes once', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  vi.useFakeTimers()

  for (const stroke of [0.6, 0.7, 0.8]) {
    await act(async () => result.current({ ...stored.meta.view, stroke }))
    await act(async () => await vi.advanceTimersByTimeAsync(100))
  }
  await act(async () => await vi.advanceTimersByTimeAsync(350))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

// Ruling 8: the edit is already on the stage and the user made it. A store that
// is down says so and takes nothing away.
test('a failed save keeps the picture and says so', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('saveFailed')
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(0.8)
})

// The store answers with the meta it wrote, and the list has to hear about it:
// the old lab reloads with `force` so the row shows the new view's command.
test('a save that lands takes the store’s meta and refreshes the list', async () => {
  const saved = { ...stored.meta, view: { ...stored.meta.view, stroke: 0.8 }, command: 'deno task carve --stroke=0.8' }
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(saved), { status: 201 }))
  let refreshed = 0
  const { result } = await renderHook(() => useViewSave(() => (refreshed += 1)), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('viewSaved')
  expect(useStore.getState().result.preview?.meta.command).toBe('deno task carve --stroke=0.8')
  expect(refreshed).toBe(1)
})
