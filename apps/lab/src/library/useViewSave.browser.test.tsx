import { decodeBoard, type View } from '@arrowz/engine'
import { act, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { userEvent } from 'vitest/browser'
import { render, renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { cancelNoticeFade, raiseNotice } from './notices'
import { cancelPendingSave, useViewSave } from './useViewSave'

const stored = storedFixture(1)
/** A second board, for the cases about an edit finished on a different one. */
const other = storedFixture(2)
const at = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/boards']}>{children}</MemoryRouter>
)

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta })
})

afterEach(() => {
  // Both module timers (the save's and the fade's), so a case cannot leave one
  // ticking into the next.
  cancelPendingSave()
  cancelNoticeFade()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Fake timers go in after `renderHook` and without `shouldAdvanceTime`, and
// every assertion is a bare `expect`: `expect.element` polls and would hang on
// a frozen clock.
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

// Not `renderHook`: that host subscribes to nothing and never re-renders, so a
// cleanup that runs per render (and posts each time) would stay invisible.
test('an edit posts once, whatever the owner re-renders in between', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  function Owner() {
    // Selecting the state the hook writes, as `BoardPreview` does, makes the
    // re-renders real.
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

// The timer is the module's, so it survives an unmount; only
// `cancelPendingSave` stops it.
test('a cancelled save never reaches the store', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  cancelPendingSave()
  await new Promise((done) => setTimeout(done, 600))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

test('a save that lands after the board changed still reports itself', async () => {
  const saved = { ...stored.meta, view: { ...stored.meta.view, stroke: 0.8 } }
  // The POST is held open, so the stage can move while the answer is in flight.
  let release = (_: Response) => {}
  const held = new Promise<Response>((resolve) => (release = resolve))
  const posts = vi.spyOn(globalThis, 'fetch').mockReturnValue(held)
  let refreshed = 0
  const { result } = await renderHook(() => useViewSave(() => (refreshed += 1)), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => posts.mock.calls.filter(([, init]) => init?.method === 'POST').length).toBe(1)

  // The stage moves on, as choosing another board does, with the answer in flight.
  await act(async () => useStore.getState().result.clearPreview())
  await act(async () => release(new Response(JSON.stringify(saved), { status: 201 })))

  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('viewSaved')
  expect(refreshed).toBe(1)
  // And the board that replaced it is not overwritten by the answer.
  expect(useStore.getState().result.preview).toBeNull()
})

test('a failed save keeps saying so, because the picture still disagrees with the store', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('saveFailed')
  // Past the 1200 ms fade the other three notices take.
  await new Promise((done) => setTimeout(done, 1500))
  expect(useStore.getState().library.notice?.kind).toBe('saveFailed')
})

// One click on another row commits the edit (blur) and changes the address at
// once, so `write` must use the board captured at the edit, not the stage.
test('an edit finished by clicking another board is written to the board that was edited', async () => {
  const posts = [] as { board: unknown; view: View }[]
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    if (init?.method !== 'POST') return new Promise(() => {})
    posts.push(JSON.parse(String(init.body)) as { board: unknown; view: View })
    return Promise.resolve(new Response(JSON.stringify(stored.meta), { status: 201 }))
  })
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.9 }))
  // The stage moves to the other board inside the pause, as the click does.
  await act(async () => {
    useStore.getState().result.showPreview({ board: decodeBoard(other.file), file: other.file, meta: other.meta })
  })
  await expect.poll(() => posts.length).toBe(1)

  expect(posts[0]?.board).toEqual(stored.file)
  expect(posts[0]?.view.stroke).toBe(0.9)
  // And the board that replaced it is left exactly as it was.
  expect(useStore.getState().result.preview?.meta.id).toBe(other.meta.id)
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(other.meta.view.stroke)
})

test('an event notice fades after 1200 ms, and a kept one never does', async () => {
  vi.useFakeTimers()

  await act(async () => raiseNotice({ kind: 'deleted', name: '8x8/x' }))
  await act(async () => await vi.advanceTimersByTimeAsync(1199))
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
  await act(async () => await vi.advanceTimersByTimeAsync(1))
  expect(useStore.getState().library.notice).toBeNull()

  // `saveFailed` describes a state, so no clock takes it away.
  await act(async () => raiseNotice({ kind: 'saveFailed' }))
  await act(async () => await vi.advanceTimersByTimeAsync(3000))
  expect(useStore.getState().library.notice?.kind).toBe('saveFailed')
})

// The identity guard inside the fade: a newer notice owns the line, and the
// timer of the one it replaced must not take it away.
test('a notice that superseded another is not cleared by the older one’s timer', async () => {
  vi.useFakeTimers()

  await act(async () => raiseNotice({ kind: 'deleted', name: '8x8/a' }))
  await act(async () => await vi.advanceTimersByTimeAsync(1100))
  await act(async () => raiseNotice({ kind: 'viewSaved', name: '8x8/b' }))
  // Past the moment the first one's timer would have fired.
  await act(async () => await vi.advanceTimersByTimeAsync(200))
  expect(useStore.getState().library.notice?.kind).toBe('viewSaved')
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

test('a failed save keeps the picture and says so', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('saveFailed')
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(0.8)
})

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
