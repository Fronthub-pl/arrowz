import { decodeBoard } from '@arrowz/engine'
import { act, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { BoardDetail } from './BoardDetail'
import { LibraryPanel } from './LibraryPanel'
// The geometry case measures the real cascade, so it needs the real
// stylesheets — without them `.fw-lib-list` never scrolls and the case passes
// on a layout that does not exist (review round 3).
import '../design/tokens.css'
import '../design/console.css'
import '../design/library.css'

const stored = storedFixture(1)

beforeEach(() => {
  const state = useStore.getState()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.lang.setLang('en')
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

async function mountDetail(path = `/boards/8x8/${stored.meta.id}`, children?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <BoardDetail refresh={() => {}} />
        <Address />
        {children}
      </div>
    </MemoryRouter>,
  )
}

/** Puts a stored board on the stage, the way `useStoredBoard` would. */
async function show() {
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
}

// Ruling 6: nothing to describe, nothing to show — and no Delete button
// pointing at no board.
test('there is no detail until the address’s board is on the stage', async () => {
  const screen = await mountDetail()
  expect(screen.container.querySelector('.fw-lib-detail')).toBeNull()
  await show()
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()
})

// Ruling 15, and the reason the case above mounts at the board's address: a
// preview alone is not enough. Review round 2 measured the first version of
// that case waiting fifteen seconds at `/boards` for a detail that Ruling 15
// forbids — the plan asserted the opposite of its own ruling.
test('a preview the address does not name shows no detail', async () => {
  const screen = await mountDetail('/boards')
  await show()
  expect(screen.container.querySelector('.fw-lib-detail')).toBeNull()
})

// Ruling 15 compares the id and nothing else. The store names a size after its
// directory, so a folder called `08x08` lists boards whose `W` is 8 — and a
// `WxH` comparison would hide the detail of a board the stage and the status
// line are both describing. No other fixture exercises this (review round 3).
test('a size the directory spells differently still gets its detail', async () => {
  const screen = await mountDetail(`/boards/08x08/${stored.meta.id}`)
  await show()
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()
})

test('the detail prints the command the store holds for this board', async () => {
  const screen = await mountDetail()
  await show()
  await expect.element(screen.getByText(stored.meta.command)).toBeVisible()
})

// Parity: the library's three numbers and two flags, and no more. `cell` and
// `top` are not here — a stored board carries no highlight, and its cell is the
// export it was saved with (Ruling 3).
test('the stored view is offered as three numbers and two switches', async () => {
  const screen = await mountDetail()
  await show()
  const numbers = [...screen.container.querySelectorAll<HTMLInputElement>('.fw-lib-detail input[type="number"]')]
  expect(numbers.map((input) => input.id)).toEqual(['view-stroke', 'view-headWidth', 'view-headHeight'])
  expect(numbers[0]?.value).toBe(String(stored.meta.view.stroke))
  expect(screen.container.querySelectorAll('.fw-lib-detail [role="switch"]')).toHaveLength(2)
})

// Ruling 9, and the old lab's own comment: "Loading sets the knobs and the view
// but does NOT generate". `setMany` leaves `edits` alone, which is the only
// thing `useAutoRun` watches, so no run can start from this.
test('load into lab sets the knobs and the view, goes to the lab, and starts nothing', async () => {
  const screen = await mountDetail()
  await show()
  const edits = useStore.getState().params.edits

  await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))

  expect(useStore.getState().params.values.seed).toBe(stored.meta.params.seed)
  expect(useStore.getState().view.stroke).toBe(stored.meta.view.stroke)
  // A stored view's `top` is 0, so the highlight lands off — the old lab's
  // behaviour, not an oversight.
  expect(useStore.getState().view.hilite).toBe(false)
  expect(useStore.getState().params.edits).toBe(edits)
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

// Ruling 1, measured where the detail exists. Two earlier versions of this
// case passed over a broken layout — one mounted the panel with no height at
// all, the other measured the detail's box while its buttons sat below the
// window. This one asks the only question that matters: can the two actions be
// reached? `toBeVisible()` cannot answer it (harness facts).
test('the detail keeps its buttons on screen while the list scrolls', async () => {
  await page.viewport(860, 900)
  const screen = await render(
    <MemoryRouter initialEntries={[`/boards/8x8/${stored.meta.id}`]}>
      <div className="fw" style={{ height: '380px', display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }}>
        <LibraryPanel />
      </div>
    </MemoryRouter>,
  )
  // Numbered from 02, and that is not arbitrary: `storedFixture(1)` builds its
  // id as `sha256-` + `01` repeated, so it ends in `01` — and a row generated
  // with that suffix *is* the board this case also shows. The task review of
  // this plan measured the first version: 41 entries of which two shared an id,
  // a duplicate React key, and two rows both carrying `aria-current`.
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...stored.meta,
    id: `${stored.meta.id.slice(0, -2)}${String(i + 2).padStart(2, '0')}`,
  }))
  await act(async () => {
    useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta, ...many] }])
  })
  await show()

  const panel = screen.container.querySelector<HTMLElement>('.fw-lib-panel')
  const list = screen.container.querySelector<HTMLElement>('.fw-lib-list')
  const buttons = screen.container.querySelector<HTMLElement>('.fw-lib-buttons')
  if (panel === null || list === null || buttons === null) throw new Error('the panel is missing a row')
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
  // The floor, so there is a list at all: without it this case cannot see the
  // grid change, only the sticky buttons (measured by review round 3's
  // mutations 9 and 10, which each tripped one case and not the other).
  expect(list.clientHeight).toBeGreaterThanOrEqual(120)
  expect(buttons.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom + 1)
})

test('the first click arms delete, and the second removes the board', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
  const screen = await mountDetail()
  await show()

  const button = screen.getByRole('button', { name: /delete from disk/i })
  await userEvent.click(button)
  // Armed: the label asks, and nothing has been sent.
  await expect.element(screen.getByRole('button', { name: /really delete/i })).toBeVisible()
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)

  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => calls.mock.calls.filter(([, init]) => init?.method === 'DELETE').length).toBe(1)
  expect(String(calls.mock.calls.find(([, init]) => init?.method === 'DELETE')?.[0])).toContain(
    `/api/boards/8x8/${stored.meta.id}`,
  )
  // Spec §5.6: the address is replaced, not pushed — Back must not walk into a
  // board that is no longer on disk.
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/boards')
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
})

// Ruling 11: pressing Delete on a board another window already removed means
// the same thing to the person looking at it — it is not there.
test('a board that was already gone still counts as deleted', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":false}', { status: 404 }))
  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleted')
})

test('a store that cannot be reached says so and keeps the board', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleteFailed')
  expect(useStore.getState().result.preview).not.toBeNull()
})

// Rulings 11 and 12 together, and the worst defect review round 2 found: a view
// edit still on its timer used to be written *after* the delete, and the store
// takes a board it cannot find for a new one — so the deleted board came back
// to the disk. Measured there against a real store; pinned here by the order
// of the requests.
test('deleting cancels a view edit that has not been written yet', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
  const screen = await mountDetail()
  await show()

  const stroke = screen.container.querySelector<HTMLInputElement>('#view-stroke')
  if (stroke === null) throw new Error('the detail offered no stroke field')
  await userEvent.fill(stroke, '0.9')
  await userEvent.tab()

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))

  // Past the debounce, so a surviving timer would have fired by now.
  await new Promise((done) => setTimeout(done, 600))
  const methods = calls.mock.calls.map(([, init]) => init?.method ?? 'GET')
  expect(methods).toContain('DELETE')
  expect(methods).not.toContain('POST')
})

// Ruling 5's fade, through the one mount that can see it. The detail raises
// `deleted` and then navigates; only `LibraryPanel`'s `key` unmounts it, and a
// bare `BoardDetail` merely renders `null` — so a case mounted the usual way
// stays green whether or not the fade survives its raiser (review round 3).
test('the deleted notice fades even though the detail that raised it is gone', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    if (init?.method === 'DELETE') return Promise.resolve(new Response('{"deleted":true}', { status: 200 }))
    return new Promise(() => {})
  })
  const screen = await render(
    <MemoryRouter initialEntries={[`/boards/8x8/${stored.meta.id}`]}>
      <div className="fw">
        <LibraryPanel />
      </div>
    </MemoryRouter>,
  )
  await act(async () => {
    useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }])
  })
  await show()

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleted')
  await expect.poll(() => screen.container.querySelector('.fw-lib-detail')).toBeNull()

  // Past the fade: the raiser is unmounted, and the notice must still go.
  await new Promise((done) => setTimeout(done, 1500))
  expect(useStore.getState().library.notice).toBeNull()
})
