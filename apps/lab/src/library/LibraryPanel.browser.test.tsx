import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MemoryRouter, useLocation } from 'react-router'
import { sizesFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { BoardList } from './BoardList'
import { SizeChips } from './SizeChips'
import '../design/tokens.css'
import '../design/library.css'

beforeEach(() => {
  const state = useStore.getState()
  state.library.reset()
  state.result.reset()
  state.lang.setLang('en')
  // The panel fetches on mount, and so does the preview hook. Unstubbed, those
  // requests reach the vitest server, which answers its own index for
  // `/api/boards` and `/store/…`; the listing that comes back then lands on top
  // of whatever state the case has just set, and the case asserts against the
  // server's answer instead of its own fixture. Measured by review round 1: two
  // of these cases failed on exactly that race. A promise that never settles is
  // the smallest stub that removes it.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The address the panel navigated to, printed where a test can read it. */
function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

async function mountPanel(path = '/boards') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <SizeChips />
        <BoardList />
        <Address />
      </div>
    </MemoryRouter>,
  )
}

test('an unreachable store says so, and an empty one says something else', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listFailed('connect ECONNREFUSED'))
  await expect.element(screen.getByText(/No store server/)).toBeVisible()

  await act(async () => useStore.getState().library.listed([]))
  await expect.element(screen.getByText(/The store is empty/)).toBeVisible()
})

test('a chip per size carries its count, and the rows carry what the store knows', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  await expect.element(screen.getByRole('button', { name: /8x8/ })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: /8x8/ })).toHaveTextContent('8x8 (2)')
  // With no board in the address the list falls back to the first size's rows,
  // so that chip is the pressed one — otherwise every chip reads unpressed
  // beside a list of rows.
  expect(screen.container.querySelector('.fw-lib-chips button')?.getAttribute('aria-pressed')).toBe('true')
  const rows = screen.container.querySelectorAll('.fw-lib-row')
  expect(rows).toHaveLength(2)
  expect(rows[0]?.textContent).toContain('pieces')
  // The whole hash is in the row, clipped by CSS and not by code.
  expect(rows[0]?.querySelector('.id')?.textContent).toHaveLength(71)
})

test('clicking a row navigates to that board', async () => {
  const screen = await mountPanel()
  const sizes = sizesFixture()
  await act(async () => useStore.getState().library.listed(sizes))
  const row = screen.container.querySelector('.fw-lib-row')
  if (!(row instanceof HTMLElement)) throw new Error('no row to click')
  // The id from the fixture, not read back out of the row the component
  // itself rendered: reading it from the DOM would let a display-and-navigate
  // pair that were wrong in the same way agree with each other. The full
  // pathname, compared with `toBe` rather than a substring match, so a
  // trailing extra segment cannot pass.
  const id = sizes[0]?.boards[0]?.id
  if (id === undefined) throw new Error('the fixture has no board to expect')
  await userEvent.click(row)
  await expect.poll(() => screen.getByTestId('address').element().textContent).toBe(`/boards/8x8/${id}`)
})

// Ruling 7: a chip opens the first board of its size, as `selectSize` does.
test('a size chip opens the first board of that size', async () => {
  const screen = await mountPanel('/boards')
  const sizes = sizesFixture()
  await act(async () => useStore.getState().library.listed(sizes))
  await userEvent.click(screen.getByRole('button', { name: /8x8/ }))
  const first = sizes[0]?.boards[0]?.id ?? ''
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${first}`)
})

// Ruling 7's other leg: a chip keeps the board already open when that board
// belongs to the chip's own size, rather than jumping to the first board of
// that size — the case above only covers the "nothing open yet" half.
// Mutation, measured in isolation: delete
// `entry.boards.find((board) => board.id === open.id) ??` from
// `SizeChips.tsx:32` and this case alone goes red — the chip would jump to
// the first board's id and abandon the one that was open.
test('a size chip keeps the board already open when it belongs to that size', async () => {
  const sizes = sizesFixture()
  const id = sizes[0]?.boards[1]?.id ?? ''
  const screen = await mountPanel(`/boards/8x8/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  await userEvent.click(screen.getByRole('button', { name: /8x8/ }))
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${id}`)
})

// Ruling 7's read leg: a chip is pressed when the address names its size,
// even when that size is not the one the store listed first. This needs a
// second size in the fixture — with only one, the address's size and the
// first listed size always coincide, so no case built on a one-size fixture
// can tell `open.size ?? sizes?.[0]?.size` apart from a plain
// `sizes?.[0]?.size` fallback. Mutation, measured in isolation: delete
// `open.size ??` from `SizeChips.tsx:18` and this case alone goes red — the
// first chip would stay pressed no matter which size the address names.
test('a chip for a size other than the first is pressed when the address names it', async () => {
  const sizes = sizesFixture()
  const second = sizes[1]
  if (second === undefined) throw new Error('the fixture needs a second size')
  const id = second.boards[0]?.id ?? ''
  const screen = await mountPanel(`/boards/${second.size}/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  await expect
    .element(screen.getByRole('button', { name: new RegExp(second.size) }))
    .toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /8x8/ }).element().getAttribute('aria-pressed')).toBe('false')
})

// The row the address names is the current one, for a screen reader as well as
// for the eye.
test('the row of the open board is marked current', async () => {
  const sizes = sizesFixture()
  const id = sizes[0]?.boards[1]?.id ?? ''
  const screen = await mountPanel(`/boards/8x8/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  const rows = screen.container.querySelectorAll('.fw-lib-row')
  expect(rows[1]?.getAttribute('aria-current')).toBe('true')
  expect(rows[0]?.getAttribute('aria-current')).toBeNull()
})
