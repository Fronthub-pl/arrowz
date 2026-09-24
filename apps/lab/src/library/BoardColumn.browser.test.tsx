import { decodeBoard } from '@arrowz/engine'
import { act, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { BoardColumn } from './BoardColumn'
import { BoardPreview } from './BoardPreview'
import { cancelNoticeFade } from './notices'
import { useOpenBoard } from './useOpenBoard'
import { cancelPendingSave } from './useViewSave'
// The style cases read the real cascade: the Delete button's border is
// `run.css`'s and its armed colour `library.css`'s.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'

const stored = storedFixture(1)
const other = storedFixture(2)

beforeEach(() => {
  const state = useStore.getState()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.lang.setLang('en')
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  // Both module timers (the save's and the fade's), so a case cannot leave one
  // ticking into the next.
  cancelPendingSave()
  cancelNoticeFade()
  vi.restoreAllMocks()
})

function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

/** The column as `Workspace` mounts it: keyed by the open board. */
function KeyedColumn() {
  const open = useOpenBoard()
  return <BoardColumn key={`${open.size ?? ''}/${open.id ?? ''}`} />
}

async function mountDetail(path = `/boards/8x8/${stored.meta.id}`, children?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <KeyedColumn />
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

test('there is no command until the address’s board is on the stage', async () => {
  const screen = await mountDetail()
  await expect.element(screen.getByText('Open a board from the list.')).toBeVisible()
  expect(screen.container.querySelector('.fw-cmdfig')).toBeNull()
  await show()
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()
})

// A preview alone is not enough: the address must name it too.
test('a preview the address does not name shows no detail', async () => {
  const screen = await mountDetail('/boards')
  await show()
  expect(screen.container.querySelector('.fw-cmdfig')).toBeNull()
})

// The window after a click, before the picture lands: a delete finished here
// would remove the board the user clicked away from.
test('a preview naming a different board than the address shows no detail', async () => {
  const screen = await mountDetail(`/boards/8x8/${other.meta.id}`)
  await show()
  expect(screen.container.querySelector('.fw-cmdfig')).toBeNull()
})

// The only fixture where the directory (`08x08`) differs from `WxH`: the gate
// compares the id alone, so the column still shows.
test('a size the directory spells differently still gets its detail', async () => {
  const screen = await mountDetail(`/boards/08x08/${stored.meta.id}`)
  await show()
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()
})

test('the column prints the command the store holds for this board', async () => {
  const screen = await mountDetail()
  await show()
  await expect
    .element(screen.getByRole('figure', { name: 'Command of this board' }))
    .toMatchTextContent(/^CLI · this board/)
  await expect.element(screen.getByText(stored.meta.command)).toBeVisible()
  // Through CommandText, one span per flag, not the stored string printed plain.
  expect(screen.container.querySelectorAll('.fw-cmd > .ln').length).toBeGreaterThan(1)
  expect([...screen.container.querySelectorAll('.fw-cmd b')].map((b) => b.textContent)).toContain(
    String(stored.meta.seed),
  )
})

test('load into lab sets the knobs and the view, goes to the lab, and starts nothing', async () => {
  const screen = await mountDetail()
  await show()
  const edits = useStore.getState().params.edits

  await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))

  expect(useStore.getState().params.values.seed).toBe(stored.meta.params.seed)
  expect(useStore.getState().view.stroke).toBe(stored.meta.view.stroke)
  // A stored view's `top` is 0, so the highlight lands off.
  expect(useStore.getState().view.highlightLongest).toBe(false)
  expect(useStore.getState().params.edits).toBe(edits)
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

// The column's Delete wears the run column's alternate button, and armed it
// turns `--error` (library.css): the second press is the destructive one.
test('Delete wears the column’s button, and armed it reads as destructive', async () => {
  const screen = await mountDetail()
  await show()
  const del = screen.getByRole('button', { name: 'Delete from disk' }).element()
  expect(getComputedStyle(del).borderTopStyle).toBe('solid')
  expect(getComputedStyle(del).borderTopWidth).toBe('1px')
  const idle = getComputedStyle(del).backgroundColor
  await userEvent.click(del)
  expect(del.className).toContain('armed')
  expect(getComputedStyle(del).backgroundColor).not.toBe(idle)
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
  // Replaced, not pushed: Back must not walk into a board no longer on disk.
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/boards')
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
})

// Pins the request itself: a size rebuilt from `W`/`H` would DELETE
// `/8x8/<id>`, get a 404 and report success while the board stays on disk.
test('a size the directory spells differently still gets its delete', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
  const screen = await mountDetail(`/boards/08x08/${stored.meta.id}`)
  await show()

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))

  await expect.poll(() => calls.mock.calls.filter(([, init]) => init?.method === 'DELETE').length).toBe(1)
  expect(String(calls.mock.calls.find(([, init]) => init?.method === 'DELETE')?.[0])).toContain(
    `/api/boards/08x08/${stored.meta.id}`,
  )
})

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

// A view edit still on its timer must not be written after the delete (the
// store would take it for a new board); pinned by the order of the requests.
test('deleting cancels a view edit that has not been written yet', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
  // The stroke row lives in the drawer's Preview panel and the Delete here:
  // siblings, as on the page.
  const screen = await mountDetail(undefined, <BoardPreview />)
  await show()

  await screen.getByRole('button', { name: /^stroke:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'stroke', exact: true }), '0.9')
  await userEvent.keyboard('{Enter}')
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(0.9)

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))

  // Past the debounce, so a surviving timer would have fired by now.
  await new Promise((done) => setTimeout(done, 600))
  const methods = calls.mock.calls.map(([, init]) => init?.method ?? 'GET')
  expect(methods).toContain('DELETE')
  expect(methods).not.toContain('POST')
})

// The column raises `deleted` and then navigates, which unmounts it: only this
// mount shows the fade surviving its raiser.
test('the deleted notice fades even though the column that raised it is gone', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    if (init?.method === 'DELETE') return Promise.resolve(new Response('{"deleted":true}', { status: 200 }))
    return new Promise(() => {})
  })
  const screen = await mountDetail()
  await act(async () => {
    useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }])
  })
  await show()

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleted')
  await expect.poll(() => screen.container.querySelector('.fw-cmdfig')).toBeNull()

  // Past the fade: the raiser is unmounted, and the notice must still go.
  await new Promise((done) => setTimeout(done, 1500))
  expect(useStore.getState().library.notice).toBeNull()
})

test('the column lists the board’s layout in full, seed, source and generation', async () => {
  const screen = await mountDetail()
  await show()
  const facts = screen.getByRole('definition').elements()
  expect(facts.map((dd) => dd.textContent)).toEqual([
    `8x8/${stored.meta.id}`,
    String(stored.meta.seed),
    stored.meta.source,
    expect.stringMatching(/ s · /),
  ])
})

// A Range on the dd's own contents counts the lines its text actually wraps
// into, the way the browser lays it out — not a declared CSS property.
function lineCount(dd: Element): number {
  const range = document.createRange()
  range.selectNodeContents(dd)
  return range.getClientRects().length
}

test.each([
  [860, 900],
  [1280, 800],
  [1400, 900],
  [375, 812],
] as const)('at %dx%d the layout hash wraps in full, and the seed stays one line', async (w, h) => {
  await page.viewport(w, h)
  const screen = await mountDetail()
  await show()
  const facts = screen.getByRole('definition').elements()
  const [layout, seed] = facts
  if (layout === undefined || seed === undefined) throw new Error('missing fact rows')
  expect(layout.textContent).toBe(`8x8/${stored.meta.id}`)
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  expect(lineCount(seed)).toBe(1)
})

test('the board file downloads the stored file under its id', async () => {
  const names: string[] = []
  const blobs: Blob[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    if (object instanceof Blob) blobs.push(object)
    return 'blob:stored-under-test'
  })
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement) || event.target.download === '') return
    names.push(event.target.download)
    event.preventDefault()
  }
  document.addEventListener('click', onClick, true)
  try {
    const screen = await mountDetail()
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Download board file' }))
    expect(names).toEqual([`${stored.meta.id}.board.json`])
    expect(JSON.parse((await blobs[0]?.text()) ?? 'null')).toEqual(stored.file)
  } finally {
    document.removeEventListener('click', onClick, true)
  }
})

// The Polish "wygenerowano" (12 characters) overflows a 9ch term track; the
// terms take one track as wide as the longest, in either language.
test.each(['en', 'pl'] as const)('in %s every fact’s term ends before its value begins', async (lang) => {
  useStore.getState().lang.setLang(lang)
  const screen = await mountDetail()
  await show()
  const rows = [...screen.container.querySelectorAll('.fw-bmeta > div')]
  expect(rows).toHaveLength(4)
  for (const row of rows) {
    const dt = row.querySelector('dt')
    const dd = row.querySelector('dd')
    if (dt === null || dd === null) throw new Error('a fact without its term or value')
    expect(dt.scrollWidth, dt.textContent ?? '').toBeLessThanOrEqual(dt.clientWidth)
    expect(dd.getBoundingClientRect().left).toBeGreaterThanOrEqual(dt.getBoundingClientRect().right)
  }
})
