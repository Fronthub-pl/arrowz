import { decodeBoard } from '@arrowz/engine'
import { genSeconds } from '@arrowz/engine/report'
import { act, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../App'
import { resetApp } from '../harness/mountApp'
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

// A stored board carries the CLI's seven view fields only; the page's colours, points, margin and voids stay.
test('load into lab leaves the view fields a stored board does not carry', async () => {
  const initial = useStore.getState().view
  const screen = await mountDetail()
  await show()
  const page = {
    paper: '#010203',
    ink: '#040506',
    highlightColor: '#0a0b0c',
    theme: 'gruvbox-dark',
    palette: ['#112233'],
    pointColor: '#070809',
    pointRadius: 0.15,
    pad: 7,
    voids: false,
    showPoints: true,
  }
  useStore.getState().view.apply(page)
  let viewChanges = 0
  let last = useStore.getState().view
  const stop = useStore.subscribe((state) => {
    if (state.view !== last) viewChanges++
    last = state.view
  })
  try {
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
    const after = useStore.getState().view
    expect(after.stroke).toBe(stored.meta.view.stroke)
    expect(after).toMatchObject(page)
    expect(viewChanges).toBe(1)
  } finally {
    stop()
    // The file's `beforeEach` does not reset the view; later cases expect the page's defaults.
    useStore.setState({ view: initial })
  }
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

  await screen.getByRole('button', { name: /^thickness:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'thickness', exact: true }), '0.9')
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

// A word (split on spaces) broken mid-word lays its own Range's client rects
// on two different tops; a whole word keeps them all on one.
function wordsStayWhole(dd: Element): boolean {
  const node = dd.firstChild
  const text = dd.textContent ?? ''
  if (node === null) return text === ''
  let offset = 0
  for (const word of text.split(' ')) {
    if (word !== '') {
      const range = document.createRange()
      range.setStart(node, offset)
      range.setEnd(node, offset + word.length)
      const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      if (tops.size > 1) return false
    }
    offset += word.length + 1
  }
  return true
}

// The exact text `BoardColumn` builds for the generated row, from the same
// deterministic fixture fields the width cases read.
function generatedText(): string {
  const created = stored.meta.createdAt ? new Date(stored.meta.createdAt).toLocaleString('en-GB') : ''
  return [`${genSeconds(stored.meta, '—')} s`, created].filter((part) => part !== '').join(' · ')
}

/** The store's list and file endpoints for the one fixture board, so `useStoredBoard` finds it the way a person's click would. */
function stubStore() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards'))
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }]))
    if (url.includes('/store/')) return Promise.resolve(Response.json(stored.file))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
}

/**
 * Opens the fixture board through the real `App`, the address bar and every
 * grid ancestor that sizes the column — `mountDetail`'s bare `.fw` div has
 * none of them, so a width case run against it never exercises the real
 * track width. `sheet` opens the phone's Board sheet, the only way its facts
 * reach the screen under 768px.
 */
async function openLibraryDetail(w: number, h: number, sheet = false) {
  await page.viewport(w, h)
  resetApp('advanced')
  stubStore()
  window.history.pushState({}, '', `/boards/8x8/${stored.meta.id}`)
  const screen = await render(<App />)
  await expect.poll(() => screen.container.querySelector('#board-column .fw-cmdfig')).not.toBeNull()
  if (sheet) await act(async () => useStore.getState().ui.setSheet('cli'))
  return screen
}

// 1280 and 1400 are both the lab's "L" band (console.css: 18rem, fixed, not
// the vw-scaled clamp — that clamp only reaches an untouched width at
// 1600px and up), and 375 is the phone's Board sheet: three widths where
// `.fw-bmeta` is actually on screen, each a different track width for the
// same hash.
test.each([
  [1280, 800, false],
  [1400, 900, false],
  [375, 812, true],
] as const)(
  'at %dx%d the layout hash wraps in full, the generated fact wraps between its parts, and the seed stays one line',
  async (w, h, sheet) => {
    try {
      const screen = await openLibraryDetail(w, h, sheet)
      const facts = screen.container.querySelectorAll('#board-column .fw-bmeta dd')
      const [layout, seed, , generated] = facts
      if (layout === undefined || seed === undefined || generated === undefined) throw new Error('missing fact rows')
      expect(layout.textContent).toBe(`8x8/${stored.meta.id}`)
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
      expect(lineCount(layout)).toBeGreaterThan(1)
      expect(lineCount(seed)).toBe(1)
      expect(generated.textContent).toBe(generatedText())
      expect(generated.scrollWidth).toBeLessThanOrEqual(generated.clientWidth)
      expect(wordsStayWhole(generated)).toBe(true)
    } finally {
      // The default a case in this file that sets no viewport of its own relies on.
      await page.viewport(414, 896)
    }
  },
  40_000,
)

// Measured, not assumed: at 768–1279 (the "S"/"M" bands) the column becomes a
// bar under the board and library.css drops its facts outright, in every
// state reachable from the UI — solo hides the whole column, and the bar
// hides just the facts within it. 860 sits in that band, so the row this
// task changed carries no clipping risk there: it is not on screen at all.
test('at 860x900 the facts stay off screen, by the S/M band’s own rule', async () => {
  try {
    const screen = await openLibraryDetail(860, 900)
    const bmeta = screen.container.querySelector('#board-column .fw-bmeta')
    if (bmeta === null) throw new Error('no facts list in the DOM')
    expect(getComputedStyle(bmeta).display).toBe('none')
  } finally {
    await page.viewport(414, 896)
  }
}, 40_000)

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
