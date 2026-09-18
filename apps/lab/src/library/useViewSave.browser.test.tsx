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
  // Both module timers, so a case cannot leave one ticking into the next: the
  // save's, and the fade's — `notices.ts` and `useViewSave.ts` each own one.
  cancelPendingSave()
  cancelNoticeFade()
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

// The Critical this task's review found, and the reason `write` is handed the
// board it was given rather than the one on the stage. One click on another
// row does two things at once: it blurs the field, which commits the edit and
// arms the timer, and it changes the address — and a local store answers well
// inside the 350 ms pause. Reading the board at write time therefore posted A's
// view onto B's file: A's edit lost, B's stored view overwritten, the message
// naming B, and nothing on screen to show for any of it.
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

  // The request carries the edited board's file and the edited view — not
  // whichever board happens to be on the stage when the timer fires.
  expect(posts[0]?.board).toEqual(stored.file)
  expect(posts[0]?.view.stroke).toBe(0.9)
  // And the board that replaced it is left exactly as it was.
  expect(useStore.getState().result.preview?.meta.id).toBe(other.meta.id)
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(other.meta.view.stroke)
})

// `notices.ts` exists to take an event notice back, and nothing measured that:
// this task's review found that deleting its whole `setTimeout` block, or
// inverting its identity guard, left every other case green. Task 8's `deleted`
// notice leans on this same branch — and the `deleted` fade is the one the
// plan's own history records as broken once already.
test('an event notice fades after 1200 ms, and a kept one never does', async () => {
  vi.useFakeTimers()

  await act(async () => raiseNotice({ kind: 'deleted', name: '8x8/x' }))
  await act(async () => await vi.advanceTimersByTimeAsync(1199))
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
  await act(async () => await vi.advanceTimersByTimeAsync(1))
  expect(useStore.getState().library.notice).toBeNull()

  // `saveFailed` describes a state, so no clock takes it away (Ruling 5).
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
// the list is reloaded so the row shows the new view's command.
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
