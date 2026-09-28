import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MemoryRouter, useLocation } from 'react-router'
import { sizesFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { LibraryFace } from './LibraryFace'
import '../design/tokens.css'
import '../design/library.css'

beforeEach(() => {
  const state = useStore.getState()
  state.library.reset()
  state.result.reset()
  state.lang.setLang('en')
  state.ui.showBoards('list')
  // The panel and the preview hook fetch on mount. Unstubbed, the vitest server
  // answers with its own index, which lands over the case's fixture. A promise
  // that never settles is the smallest stub that removes the race.
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
        <LibraryFace />
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

test('a tab per size carries its count, and the rows carry what the store knows', async () => {
  const sizes = sizesFixture()
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizes))
  // The count is in the tab's name and says what it counts; the digit alone
  // would announce "8×8 2".
  const tab = screen.getByRole('tab', { name: '8×8, 2 boards' })
  await expect.element(tab).toBeVisible()
  await expect.element(tab).toHaveTextContent('8×82')
  // With no board in the address the first size's rows show, so its tab is selected.
  await expect.element(tab).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tabpanel', { name: '8×8, 2 boards' })).toBeVisible()
  await expect.element(screen.getByText('2 boards', { exact: true })).toBeVisible()
  const rows = screen.container.querySelectorAll('.fw-brow')
  expect(rows).toHaveLength(2)
  const meta = sizes[0]?.boards[0]
  if (meta === undefined) throw new Error('the fixture has no board')
  expect(rows[0]?.querySelector('.meta')?.textContent).toBe(`${meta.pieces} arrows · longest ${meta.maxLen}`)
  expect(rows[0]?.querySelector('.src')?.textContent).toBe(meta.source)
  // The row prints eight and four digits of the hash; the whole id is its title.
  const hex = meta.id.slice('sha256-'.length)
  expect(rows[0]?.querySelector('.id')?.textContent).toBe(`${hex.slice(0, 8)}…${hex.slice(-4)}`)
  expect(rows[0]?.getAttribute('title')).toBe(meta.id)
})

// A board that did not close says so, in `--warn`, where its source would stand.
test('a board that did not close says so in place of its source', async () => {
  const size = sizesFixture()[0]
  const first = size?.boards[0]
  if (size === undefined || first === undefined) throw new Error('the fixture has no board')
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed([{ ...size, boards: [{ ...first, ok: false }] }]))
  const src = screen.container.querySelector('.fw-brow .src')
  expect(src?.textContent).toBe('incomplete')
  expect(src?.classList.contains('bad')).toBe(true)
})

test('clicking a row navigates to that board', async () => {
  const screen = await mountPanel()
  const sizes = sizesFixture()
  await act(async () => useStore.getState().library.listed(sizes))
  const row = screen.container.querySelector('.fw-brow')
  if (!(row instanceof HTMLElement)) throw new Error('no row to click')
  // The id from the fixture, not the DOM, so a display and a navigation wrong
  // the same way cannot agree. The whole pathname, so an extra segment fails.
  const id = sizes[0]?.boards[0]?.id
  if (id === undefined) throw new Error('the fixture has no board to expect')
  await userEvent.click(row)
  await expect.poll(() => screen.getByTestId('address').element().textContent).toBe(`/boards/8x8/${id}`)
})

test('a size tab opens the first board of that size', async () => {
  const screen = await mountPanel('/boards')
  const sizes = sizesFixture()
  await act(async () => useStore.getState().library.listed(sizes))
  await userEvent.click(screen.getByRole('tab', { name: /^8×8/ }))
  const first = sizes[0]?.boards[0]?.id ?? ''
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${first}`)
})

test('a size tab keeps the board already open when it belongs to that size', async () => {
  const sizes = sizesFixture()
  const id = sizes[0]?.boards[1]?.id ?? ''
  const screen = await mountPanel(`/boards/8x8/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  await userEvent.click(screen.getByRole('tab', { name: /^8×8/ }))
  await expect.element(screen.getByTestId('address')).toHaveTextContent(`/boards/8x8/${id}`)
})

// Needs a second size: with one, the address's size is always the first listed.
test('a tab for a size other than the first is selected when the address names it', async () => {
  const sizes = sizesFixture()
  const second = sizes[1]
  if (second === undefined) throw new Error('the fixture needs a second size')
  const id = second.boards[0]?.id ?? ''
  const screen = await mountPanel(`/boards/${second.size}/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  await expect
    .element(screen.getByRole('tab', { name: new RegExp(`^${second.size.replace('x', '×')}`) }))
    .toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: /^8×8/ }).element().getAttribute('aria-selected')).toBe('false')
})

// End to end, because the slice cases cannot see which outcome `listBoards`
// hands over: a dead store must reach the slice as a failure, not an empty
// listing. The empty-bodied 502 is what Vite's proxy answers for a dead store.
test('a refresh that finds no store keeps the rows it already listed', async () => {
  const sizes = sizesFixture()
  let answer = () => Promise.resolve(Response.json(sizes))
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => answer())
  const screen = await mountPanel()
  await expect.element(screen.getByRole('tab', { name: /^8×8/ })).toBeVisible()

  answer = () => Promise.resolve(new Response(null, { status: 502 }))
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await expect.element(screen.getByText(/No store server/)).toBeVisible()
  // Two sizes and Preview.
  expect(screen.getByRole('tab').elements()).toHaveLength(3)
  expect(screen.container.querySelectorAll('.fw-brow')).toHaveLength(2)
})

// The row the address names is the current one, for a screen reader as well as
// for the eye.
test('the row of the open board is marked current', async () => {
  const sizes = sizesFixture()
  const id = sizes[0]?.boards[1]?.id ?? ''
  const screen = await mountPanel(`/boards/8x8/${id}`)
  await act(async () => useStore.getState().library.listed(sizes))
  const rows = screen.container.querySelectorAll('.fw-brow')
  expect(rows[1]?.getAttribute('aria-current')).toBe('true')
  expect(rows[0]?.getAttribute('aria-current')).toBeNull()
})

// One caller, one fetch per mount: the hook's guard stops a second fetch only
// once an answer is in. (Under StrictMode the app fetches twice and drops the
// first answer; `vitest-browser-react` renders without StrictMode.)
test('the listing is fetched once per mount, however many children want refreshing', async () => {
  const calls = vi.spyOn(globalThis, 'fetch')
  await mountPanel()
  await expect.poll(() => calls.mock.calls.filter(([url]) => String(url).includes('/api/boards')).length).toBe(1)
})

// The rail and the list fall back together (`openEntry`).
test('an address naming a size the store has not got selects no tab, and still lists rows', async () => {
  const screen = await mountPanel('/boards/10x10/sha256-0')
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  expect(screen.container.querySelectorAll('.fw-brow').length).toBeGreaterThan(0)
  const selected = screen
    .getByRole('tab')
    .elements()
    .filter((tab) => tab.getAttribute('aria-selected') === 'true')
  expect(selected).toHaveLength(0)
  // A tablist with none selected still keeps one tab in the tab order.
  expect(
    screen
      .getByRole('tab')
      .elements()
      .filter((tab) => tab.tabIndex === 0),
  ).toHaveLength(1)
  await expect.element(screen.getByRole('tabpanel', { name: 'Boards of this size' })).toBeVisible()
})

// The drawer's two regions have names of their own, not the tab's "Saved boards".
test('the rail and the list have names of their own, and neither is "Saved boards"', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  await expect.element(screen.getByRole('tablist', { name: 'Board sizes and preview' })).toBeInTheDocument()
  await expect.element(screen.getByRole('tabpanel', { name: '8×8, 2 boards' })).toBeInTheDocument()
  expect(screen.container.querySelectorAll('[aria-label="Saved boards"]')).toHaveLength(0)
})

// The rail's ELEMENT section: Preview swaps the panel for the open board's
// preview rows and back, and the rail keeps the size's tab for the return.
test('Preview swaps the list for the preview rows, and a size swaps it back', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  await userEvent.click(screen.getByRole('tab', { name: 'Preview' }))
  await expect.element(screen.getByRole('tabpanel', { name: 'Preview' })).toBeVisible()
  expect(screen.container.querySelector('.fw-brow')).toBeNull()
  await expect.element(screen.getByText('Open a board from the list.')).toBeVisible()
  await userEvent.click(screen.getByRole('tab', { name: /^8×8/ }))
  await expect.element(screen.getByRole('tabpanel', { name: '8×8, 2 boards' })).toBeVisible()
  expect(useStore.getState().ui.boards).toBe('list')
})

// The lab rail's keys: down and up walk the entries, End jumps to Preview.
test('the arrow keys walk the rail, sizes then Preview, and the focus follows', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  const first = screen.getByRole('tab', { name: /^8×8/ })
  first.element().focus()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tab', { name: 'Preview' })).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
  await expect.element(first).toHaveAttribute('aria-selected', 'true')
  await expect.element(first).toHaveFocus()
})

test('with no store the rail holds only Preview', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listFailed('connect ECONNREFUSED'))
  expect(
    screen
      .getByRole('tab')
      .elements()
      .map((tab) => tab.textContent),
  ).toEqual(['Preview'])
})
