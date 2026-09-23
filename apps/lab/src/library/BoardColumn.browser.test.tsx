import { decodeBoard } from '@arrowz/engine'
import { act, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { userEvent } from 'vitest/browser'
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
  // Both module timers, so a case cannot leave one ticking into the next: the
  // save's, and the fade's — `notices.ts` and `useViewSave.ts` each own one.
  // Safe today without this only because the fade's identity guard makes a
  // leaked timer a no-op after `library.reset()` — accidental from this
  // file's point of view (`useViewSave.browser.test.tsx` cancels both).
  cancelPendingSave()
  cancelNoticeFade()
  vi.restoreAllMocks()
})

function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

/** The column as `Workspace` mounts it: keyed by the open board (Ruling 10). */
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

// Ruling 6: nothing to describe, nothing to show — and no Delete button
// pointing at no board; the column says how to open one instead.
test('there is no command until the address’s board is on the stage', async () => {
  const screen = await mountDetail()
  await expect.element(screen.getByText('Open a board from the list.')).toBeVisible()
  expect(screen.container.querySelector('.fw-cmdfig')).toBeNull()
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
  expect(screen.container.querySelector('.fw-cmdfig')).toBeNull()
})

// Ruling 15's actual window: the address names one board while `preview.meta`
// still holds another — the click has landed, the picture has not. A two-click
// delete finished here would remove the board the user clicked away from, so
// the gate must reject this case and not merely the "no preview at all" one
// above.
test('a preview naming a different board than the address shows no detail', async () => {
  const screen = await mountDetail(`/boards/8x8/${other.meta.id}`)
  await show()
  expect(screen.container.querySelector('.fw-cmdfig')).toBeNull()
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

test('the column prints the command the store holds for this board', async () => {
  const screen = await mountDetail()
  await show()
  await expect
    .element(screen.getByRole('figure', { name: 'Command of this board' }))
    .toMatchTextContent(/^CLI · this board/)
  await expect.element(screen.getByText(stored.meta.command)).toBeVisible()
  // Spec §7: through CommandText, one span per flag and the value in bold —
  // not the stored string printed plain.
  expect(screen.container.querySelectorAll('.fw-cmd > .ln').length).toBeGreaterThan(1)
  expect([...screen.container.querySelectorAll('.fw-cmd b')].map((b) => b.textContent)).toContain(
    String(stored.meta.seed),
  )
})

// Ruling 9: loading sets the knobs and the view but does NOT generate.
// `setMany` leaves `edits` alone, which is the only thing `useAutoRun`
// watches, so no run can start from this.
test('load into lab sets the knobs and the view, goes to the lab, and starts nothing', async () => {
  const screen = await mountDetail()
  await show()
  const edits = useStore.getState().params.edits

  await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))

  expect(useStore.getState().params.values.seed).toBe(stored.meta.params.seed)
  expect(useStore.getState().view.stroke).toBe(stored.meta.view.stroke)
  // A stored view's `top` is 0, so the highlight lands off — deliberate, not
  // an oversight.
  expect(useStore.getState().view.hilite).toBe(false)
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
  // Spec §5.6: the address is replaced, not pushed — Back must not walk into a
  // board that is no longer on disk.
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/boards')
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
})

// Whole-branch review, finding 1: the delete used to reconstruct the size from
// `meta.W`/`meta.H`, which disagrees with a folder like `08x08` exactly the way
// Ruling 15 describes — so the DELETE went to `/api/boards/8x8/<id>`, the store
// found nothing there, and a 404 was read back as a successful delete of a
// board still on disk. This pins the request itself, not just the notice.
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
  // The stroke row lives in the drawer's Preview panel now (handoff 2, PR 6),
  // and the Delete in this column: the two are siblings, as on the page.
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

// Ruling 5's fade, through the mount that can see it. The column raises
// `deleted` and then navigates, and its key — the board — unmounts it: the
// fade must survive its raiser (review round 3).
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

// Handoff 2, PR 6: the column ends on what the board is — the layout under its
// short id with the whole id in the title, the seed, the source, and when and
// how fast it was generated.
test('the column lists the board’s layout, seed, source and generation', async () => {
  const screen = await mountDetail()
  await show()
  const facts = screen.getByRole('definition').elements()
  const hex = stored.meta.id.slice('sha256-'.length)
  expect(facts.map((dd) => dd.textContent)).toEqual([
    `8x8/${hex.slice(0, 8)}…${hex.slice(-4)}`,
    String(stored.meta.seed),
    stored.meta.source,
    expect.stringMatching(/ s · /),
  ])
  expect(facts[0]?.getAttribute('title')).toBe(stored.meta.id)
})

// The board file goes out as the store holds it, named by its layout hash —
// the id — as the run column names a run's file.
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

// Measured in Chrome (handoff 2, PR 6): the Polish "wygenerowano" is twelve
// characters and ran into its value from the handoff's 9ch term track. The
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
