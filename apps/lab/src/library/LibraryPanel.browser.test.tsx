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
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  const row = screen.container.querySelector('.fw-lib-row')
  if (!(row instanceof HTMLElement)) throw new Error('no row to click')
  const id = row.querySelector('.id')?.textContent ?? ''
  await userEvent.click(row)
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${id}`)
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
