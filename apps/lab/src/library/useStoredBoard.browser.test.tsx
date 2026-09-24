import { decodeBoard } from '@arrowz/engine'
import type { ReactNode } from 'react'
import { expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { MemoryRouter, useNavigate } from 'react-router'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { useStoredBoard } from './useStoredBoard'

const first = storedFixture(1)
const second = storedFixture(2)

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().lang.setLang('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A store that answers `/store/<size>/<id>.board.json` from the fixtures. */
function stubStore(answers: Record<string, unknown>, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    const body = Object.entries(answers).find(([id]) => url.includes(id))?.[1]
    if (body === undefined) return Promise.resolve(new Response('{}', { status: 404 }))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })
}

const at = (path: string) => ({
  wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
})

test('the board the address names is decoded and shown', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().result.preview?.meta.id).toBe(first.meta.id)
  expect(useStore.getState().result.preview?.board.W).toBe(8)
  expect(useStore.getState().library.boardError).toBeNull()
})

test('a board that cannot be read clears the stage and reports the reason', async () => {
  stubStore({})
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().library.boardError).not.toBeNull()
  // The two halves the hook writes: the address it fetched for, and the failure
  // as it came — not one sentence for the reader to take apart again.
  expect(useStore.getState().library.boardError?.name).toBe(`8x8/${first.meta.id}`)
  expect(useStore.getState().library.boardError?.reason).toContain('404')
  expect(useStore.getState().result.preview).toBeNull()
})

test('an answer for a board no longer open is dropped', async () => {
  // An assertion, not `let release: (() => void) | null = null`: TypeScript
  // narrows that to `null`, misses the assignment in the executor, and
  // `release?.()` fails to compile as `never`.
  let release = null as (() => void) | null
  const held = new Promise<void>((done) => {
    release = done
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes(first.meta.id)) {
      await held
      return new Response(JSON.stringify(first.file), { status: 200 })
    }
    return new Response(JSON.stringify(second.file), { status: 200 })
  })
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta, second.meta] }])

  const view = await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  view.unmount()
  release?.()
  await held
  // A microtask is not enough: the dropped answer would land on the next one.
  await new Promise((done) => setTimeout(done, 20))
  expect(useStore.getState().result.preview).toBeNull()
})

// A stale link at the hook: the listing has arrived without this id. Another
// board is on screen first, so the case also proves the clearing half.
test('an id the listing does not hold is reported, and clears what was shown', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  useStore.getState().result.showPreview({ board: decodeBoard(first.file), file: first.file, meta: first.meta })

  await renderHook(() => useStoredBoard(), at('/boards/8x8/sha256-0'))

  await expect.poll(() => useStore.getState().library.boardError?.reason).toBe('not in the store')
  expect(useStore.getState().result.preview).toBeNull()
})

test('a board that has arrived leaves no loading notice behind', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().result.preview?.meta.id).toBe(first.meta.id)
  expect(useStore.getState().library.notice).toBeNull()
})

// B's fetch is cancelled by the walk back to A, and the effect for A returns
// early because A is already drawn: that early return must clear "Loading B…".
test('walking away from a board still loading, and back, leaves no loading notice', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta, second.meta] }])
  // A host that really navigates: `renderHook(...).rerender` takes the hook's
  // props, so a fresh `MemoryRouter` wrapper would never move the address.
  function Walk() {
    useStoredBoard()
    const navigate = useNavigate()
    return (
      <div>
        <button type="button" onClick={() => void navigate(`/boards/8x8/${first.meta.id}`)}>
          A
        </button>
        <button type="button" onClick={() => void navigate(`/boards/8x8/${second.meta.id}`)}>
          B
        </button>
      </div>
    )
  }
  const screen = await render(
    <MemoryRouter initialEntries={[`/boards/8x8/${first.meta.id}`]}>
      <Walk />
    </MemoryRouter>,
  )
  await expect.poll(() => useStore.getState().result.preview?.meta.id).toBe(first.meta.id)

  // B's file must stay in flight across both clicks. `userEvent.click` here
  // returns only once the page is idle, so any mock that settles (even late)
  // settles inside the click; a promise that never resolves does not.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  await userEvent.click(screen.getByRole('button', { name: 'B' }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('loading')
  await userEvent.click(screen.getByRole('button', { name: 'A' }))

  await expect.poll(() => useStore.getState().library.notice).toBeNull()
  expect(useStore.getState().result.preview?.meta.id).toBe(first.meta.id)
})

test('a board that fails to load leaves no loading notice behind', async () => {
  stubStore({})
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().library.boardError).not.toBeNull()
  expect(useStore.getState().library.notice).toBeNull()
})

// `saveFailed` does not fade, and only the hook's no-board branch clears it.
test('closing the board clears a failed-save notice that outlived it', async () => {
  useStore.getState().library.notify({ kind: 'saveFailed' })

  await renderHook(() => useStoredBoard(), at('/boards'))

  expect(useStore.getState().library.notice).toBeNull()
})
