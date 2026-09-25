import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
import { decodeBoard } from '@arrowz/engine'
import { storedFixture } from '../state/library.fixtures'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { ReportPanel } from './ReportPanel'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/report.css'

// Seed 1: 8 pieces, longest 18. Seed 2: 13 pieces, longest 17 (both close).
const ONE = finishedRun(1)
const TWO = finishedRun(2)

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.lang.setLang('en')
  state.view.setFlag('highlightLongest', true)
  state.view.setNumber('top', '5')
})

/**
 * The panel asks the route (`useInLibrary`), so it needs a router. No address
 * of its own: every case here is the lab, `/`.
 */
async function mountReport(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw" style={{ display: 'grid', width: '352px', height: '600px' }}>
        <ReportPanel />
      </div>
    </MemoryRouter>,
  )
}

function stats(container: HTMLElement): HTMLTableElement {
  const table = container.querySelector('table.fw-stats')
  if (!(table instanceof HTMLTableElement)) throw new Error('the statistics table is not on the page')
  return table
}

/** The statistics' own rows, in order, without the groups' headings. */
function dataRows(container: HTMLElement): HTMLTableRowElement[] {
  return [...stats(container).rows].filter((tr) => !tr.classList.contains('grp'))
}

/**
 * The cells of one statistic: label, value, delta. Counted without the group
 * headings, so rows 1 and 3 are still pieces and longest; a heading counted in
 * would shift every index and leave each case reading its neighbour.
 */
function row(container: HTMLElement, at: number): HTMLTableRowElement {
  const found = dataRows(container)[at]
  if (found === undefined) throw new Error(`no row ${at}`)
  return found
}

/** A row's label, without its `?`. */
function labelOf(tr: HTMLTableRowElement | undefined): string | null | undefined {
  return tr?.cells[0]?.querySelector('.st-lab')?.textContent
}

/** The summary over the table, or a failure. */
function summary(container: HTMLElement): HTMLDListElement {
  const found = container.querySelector('dl.fw-rsum')
  if (!(found instanceof HTMLDListElement)) throw new Error('the summary is not on the page')
  return found
}

/** One figure of the summary: its term, its number and its change. */
function figure(container: HTMLElement, at: number) {
  const box = summary(container).children[at]
  const term = box?.querySelector('dt')
  const value = box?.querySelector('dd .v')
  const change = box?.querySelector('dd small')
  if (!(term instanceof HTMLElement) || !(value instanceof HTMLElement) || !(change instanceof HTMLElement))
    throw new Error(`no figure ${at}`)
  return { box, term, value, change }
}

/**
 * The longest-pieces heading, or a failure, like `stats` and `row` above. A
 * substitute node would be measured instead: `<body>` has a computed style too,
 * so a heading that stopped rendering would not go red.
 */
function longestHead(container: HTMLElement): HTMLHeadingElement {
  const head = container.querySelector('#longest-head')
  if (!(head instanceof HTMLHeadingElement)) throw new Error('the longest-pieces heading is not on the page')
  return head
}

test('the report is a named region, empty until there is a result', async () => {
  const screen = await mountReport()
  await expect.element(screen.getByRole('region', { name: 'Report' })).toBeInTheDocument()
  expect(screen.container.querySelector('table')).toBeNull()
})

// The engine's four separators bound five groups, each named in a heading row
// that spans the table.
test('twenty-three rows in five named groups, labelled by row headers', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const table = stats(screen.container)
  expect(table.tBodies).toHaveLength(5)
  expect(dataRows(screen.container)).toHaveLength(23)
  expect(table.getAttribute('aria-label')).toBe('Statistics')
  const heads = [...table.tBodies].map((body) => body.rows[0])
  for (const head of heads) {
    expect(head?.className).toBe('grp')
    expect(head?.cells).toHaveLength(1)
    expect(head?.cells[0]?.tagName).toBe('TH')
    expect(head?.cells[0]?.getAttribute('scope')).toBe('rowgroup')
    expect(head?.cells[0]?.getAttribute('colspan')).toBe('3')
  }
  expect(heads.map((head) => head?.textContent)).toEqual(['size', 'difficulty', 'reach', 'shape', 'generator'])
  const first = row(screen.container, 0)
  expect(first.cells[0]?.tagName).toBe('TH')
  expect(first.cells[0]?.getAttribute('scope')).toBe('row')
  expect(first.cells[1]?.textContent).toBe('8 × 8 = 64 cells, seed 1')
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect([...table.tBodies].map((body) => body.rows[0]?.textContent)).toEqual([
    'rozmiar',
    'trudność',
    'zasięg',
    'kształt',
    'generator',
  ])
})

// A group heading reads as `.kv-sub` does in the Preview panel: caps at 11px
// with its rule under it, and a row as `.kv-row`: 34px with its own rule.
test('the groups and rows keep the rhythm of the Preview panel', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const head = stats(screen.container).tBodies[1]?.rows[0]?.cells[0]
  if (head === undefined) throw new Error('no group heading')
  const style = getComputedStyle(head)
  expect(style.fontSize).toBe('11px')
  expect(style.textTransform).toBe('uppercase')
  expect(style.paddingTop).toBe('22px')
  // Row 5 is f0: short label, short value, no summary to hide it.
  const f0 = row(screen.container, 5)
  expect(getComputedStyle(f0).display).toBe('grid')
  expect(f0.getBoundingClientRect().height).toBe(34)
  expect(getComputedStyle(f0.cells[0] as HTMLElement).color).toBe(tokenColour('--mist'))
})

test('the first result has nothing to compare with', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  for (const cell of stats(screen.container).querySelectorAll('.fw-delta')) expect(cell.textContent).toBe('')
})

// Compared by row index against the result shown before. Pieces is neutral:
// its sign and nothing else. Longest is `better: 1`, and it fell.
test('the second result is compared with the first, row by row', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  const pieces = row(screen.container, 1).cells[2]
  const longest = row(screen.container, 3).cells[2]
  expect(pieces?.textContent).toBe('+5.0')
  expect(pieces?.className).toBe('fw-delta neutral')
  expect(longest?.textContent).toBe('−1.0 worse')
  expect(longest?.className).toBe('fw-delta worse')
  expect(longest?.querySelector('.fw-vh')?.textContent).toBe(' worse')
})

// Rendering never moves the baseline, so a language switch rebuilds both
// reports and the rows still line up.
test('a language switch keeps every delta', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(labelOf(row(screen.container, 1))).toBe('strzałki')
  expect(row(screen.container, 1).cells[2]?.textContent).toBe('+5.0')
  expect(row(screen.container, 3).cells[2]?.textContent).toBe('−1.0 gorzej')
})

// f0 is row 5, on screen and not repeated by the summary.
test("a row's ? opens its sentence under it, and closes it", async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const f0 = row(screen.container, 5)
  const button = f0.cells[0]?.querySelector('button.q')
  if (!(button instanceof HTMLButtonElement)) throw new Error('f0 has no ?')
  expect(button.getAttribute('aria-label')).toBe('About free at start')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  const help = document.getElementById(button.getAttribute('aria-controls') ?? '')
  expect(help?.textContent).toBe('Arrows you can remove on the very first move. Lower = harder.')
  expect(help?.classList.contains('fw-vh')).toBe(true)
  expect(f0.getBoundingClientRect().height).toBe(34)
  await act(async () => button.click())
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(help?.classList.contains('fw-vh')).toBe(false)
  expect(help?.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    f0.cells[0]?.getBoundingClientRect().bottom ?? Infinity,
  )
  await act(async () => button.click())
  expect(help?.classList.contains('fw-vh')).toBe(true)
})

test('an open help follows the language and a new result, on the same row', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const button = () => row(screen.container, 5).cells[0]?.querySelector('button.q')
  await act(async () => (button() as HTMLButtonElement).click())
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(button()?.getAttribute('aria-expanded')).toBe('true')
  expect(row(screen.container, 5).querySelector('.st-help p')?.textContent).toBe(
    'Strzałki, które można zdjąć w pierwszym ruchu. Mniej = trudniej.',
  )
  await act(async () => finish(TWO))
  expect(button()?.getAttribute('aria-expanded')).toBe('true')
  expect(row(screen.container, 6).cells[0]?.querySelector('button.q')?.getAttribute('aria-expanded')).toBe('false')
})

// No statistics, but the longest pieces are the board's and stay.
test('a result without metrics shows no statistics and still shows its longest pieces', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish({ ...TWO, report: { ...TWO.report, metrics: null } }))
  expect(screen.container.querySelector('table.fw-stats')).toBeNull()
  expect(screen.container.querySelector('table.fw-longest')).not.toBeNull()
})

test('the longest pieces follow the highlight count, and go with the highlight', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const longest = () => screen.container.querySelector('table.fw-longest')
  expect(longest()?.querySelectorAll('tbody tr')).toHaveLength(5)
  expect(screen.container.querySelector('#longest-head')?.textContent).toBe('The 5 longest arrows')
  await act(async () => useStore.getState().view.setNumber('top', '3'))
  expect(longest()?.querySelectorAll('tbody tr')).toHaveLength(3)
  await act(async () => useStore.getState().view.setFlag('highlightLongest', false))
  expect(longest()).toBeNull()
})

// An h2, so the document has no level gap; the stylesheet must follow the
// level, or the heading renders at 18px bold and nothing else notices.
test('the longest-pieces heading keeps the report voice after the level change', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const head = longestHead(screen.container)
  expect(head.tagName).toBe('H2')
  const style = getComputedStyle(head)
  expect(style.fontSize).toBe('11px')
  expect(style.textTransform).toBe('uppercase')
})

const TOKEN = { better: '--ok', worse: '--error', neutral: '--ash' } as const

/** What a token computes to, read off a throw-away node rather than parsed from the stylesheet. */
function tokenColour(token: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  document.body.append(probe)
  const colour = getComputedStyle(probe).color
  probe.remove()
  return colour
}

/**
 * Checks a delta cell's kind, that it wears its own token (a contrast check
 * alone passes a worse cell left at `--ash`), and that it reads at AA.
 */
function readsAtAA(cell: HTMLTableCellElement | undefined, kind: 'better' | 'worse' | 'neutral') {
  if (cell === undefined) throw new Error('a delta cell is missing')
  expect(cell.className).toBe(`fw-delta ${kind}`)
  expect(getComputedStyle(cell).color, kind).toBe(tokenColour(TOKEN[kind]))
  const { front, back } = shown(cell)
  expect(contrast(front, back), kind).toBeGreaterThanOrEqual(4.5)
}

/** The first delta cell of a kind the eye can see: summary rows leave the table. */
function shownDelta(container: HTMLElement, kind: 'better' | 'worse' | 'neutral'): HTMLTableCellElement {
  const found = dataRows(container)
    .filter((tr) => getComputedStyle(tr).display !== 'none')
    .map((tr) => tr.cells[2])
    .find((cell) => cell?.classList.contains(kind))
  if (found === undefined) throw new Error(`no ${kind} delta on screen`)
  return found
}

// Worse `--error`, neutral `--ash`, better `--ok` (6.6:1), on `--graphite`.
// Measured on rows still on screen, at the moment each class is on the cell:
// React keeps the `<td>` across results, so an earlier read would be stale.
test('every kind of delta reads at AA', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  readsAtAA(shownDelta(screen.container, 'worse'), 'worse')
  readsAtAA(shownDelta(screen.container, 'neutral'), 'neutral')
  await act(async () => finish(ONE))
  readsAtAA(shownDelta(screen.container, 'better'), 'better')
})

// Four figures over the table (pieces, longest, D, time): each its number, its
// term, then its change, and the caption says against what.
test('the summary puts four figures over the table, term before number in the markup', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const list = summary(screen.container)
  const cap = screen.container.querySelector('p.fw-rsum-cap')
  expect(cap?.textContent).toBe(
    "vs. the previous board: green = better, red = worse; a row's ? says which way is better",
  )
  expect(list.getAttribute('aria-describedby')).toBe(cap?.id)
  expect(cap?.id).not.toBe('')
  expect([...list.children].map((box) => box.firstElementChild?.tagName)).toEqual(['DT', 'DT', 'DT', 'DT'])
  expect([0, 1, 2, 3].map((at) => figure(screen.container, at).term.textContent)).toEqual([
    'arrows',
    'longest',
    'D',
    'time',
  ])
  expect(figure(screen.container, 0).value.textContent).toBe(row(screen.container, 1).cells[1]?.textContent)
  expect(figure(screen.container, 1).value.textContent).toBe('18')
  expect(figure(screen.container, 2).value.textContent).toBe(row(screen.container, 7).cells[1]?.textContent)
  expect(figure(screen.container, 3).value.textContent).toMatch(/^\d+\.\d\d s$/)
  // Number, term, change, top to bottom on screen, whatever the markup's order.
  const { term, value, change } = figure(screen.container, 0)
  expect(value.getBoundingClientRect().bottom).toBeLessThanOrEqual(term.getBoundingClientRect().top)
  expect(term.getBoundingClientRect().bottom).toBeLessThanOrEqual(change.getBoundingClientRect().top)
  // Nothing to compare with yet: every change is a placeholder the eye skips.
  for (const at of [0, 1, 2, 3]) {
    const { change } = figure(screen.container, at)
    expect(change.className).toBe('none')
    expect(getComputedStyle(change).visibility).toBe('hidden')
  }
})

// What the hidden rows said stays reachable: the full name of D and the whole
// value of longest and time, in their titles.
test('the summary keeps what the rows it hides used to say', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const abbr = figure(screen.container, 2).term.querySelector('abbr')
  expect(abbr?.textContent).toBe('D')
  expect(abbr?.getAttribute('title')).toBe('depth')
  expect(figure(screen.container, 1).value.title).toBe(row(screen.container, 3).cells[1]?.textContent)
  expect(figure(screen.container, 3).value.title).toBe(row(screen.container, 22).cells[1]?.textContent)
  expect(figure(screen.container, 0).value.title).toBe('')
})

// The same `reportDelta` as the table, so the colour follows the row's
// `better`, never the sign; time reports no change at all.
test('the summary compares with the previous run as the table does', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  const pieces = figure(screen.container, 0).change
  const longest = figure(screen.container, 1).change
  expect(pieces.textContent).toBe('+5.0')
  expect(pieces.className).toBe('neutral')
  expect(longest.textContent).toBe('−1.0 worse')
  expect(longest.className).toBe('worse')
  expect(getComputedStyle(longest).color).toBe(tokenColour('--error'))
  expect(contrast(shown(longest).front, shown(longest).back)).toBeGreaterThanOrEqual(4.5)
  expect(figure(screen.container, 3).change.className).toBe('none')
  await act(async () => finish(ONE))
  expect(longest.className).toBe('better')
  expect(getComputedStyle(longest).color).toBe(tokenColour('--ok'))
  expect(contrast(shown(longest).front, shown(longest).back)).toBeGreaterThanOrEqual(4.5)
})

// One number, one place: the rows the summary repeats leave the table.
test('the rows the summary repeats leave the table, and only those', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const hidden = dataRows(screen.container)
    .map((tr, at) => [at, getComputedStyle(tr).display] as const)
    .filter(([, display]) => display === 'none')
    .map(([at]) => at)
  // pieces, longest, D, time
  expect(hidden).toEqual([1, 3, 7, 22])
})

// A value wider than a number stays on its label's line, and a row with no
// change gives its value the change's track (`nodelta`, not `:has()`).
test('wide values are chosen by the row, and a row without a change widens its value', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const long = dataRows(screen.container)
    .map((tr, at) => [at, tr.classList.contains('long')] as const)
    .filter(([, is]) => is)
    .map(([at]) => at)
  // board, longest, lengths, blocking distance, stopped short, merged leftovers, time
  expect(long).toEqual([0, 3, 4, 14, 19, 20, 22])
  expect(row(screen.container, 0).classList.contains('nodelta')).toBe(true)
  expect(getComputedStyle(row(screen.container, 0).cells[2] as HTMLElement).display).toBe('none')
  await act(async () => finish(TWO))
  // The board never has a change; pieces moved by five.
  expect(row(screen.container, 0).classList.contains('nodelta')).toBe(true)
  expect(row(screen.container, 1).classList.contains('nodelta')).toBe(false)
})

// At the L drawer's 352px, in both languages, no row is wider than the table
// and the summary's four columns are each at least 80px.
test('at 352px nothing in the report runs past its row, in English or Polish', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  for (const lang of ['en', 'pl'] as const) {
    await act(async () => useStore.getState().lang.setLang(lang))
    // The longest sentence in either language (stall), open: it wraps inside its own cell.
    const stall = row(screen.container, 19).cells[0]?.querySelector('button.q')
    if (stall?.getAttribute('aria-expanded') === 'false') await act(async () => (stall as HTMLButtonElement).click())
    for (const tr of stats(screen.container).rows)
      expect(tr.scrollWidth, `${lang}: ${tr.textContent}`).toBeLessThanOrEqual(tr.clientWidth)
    for (const box of summary(screen.container).children) {
      expect(box.getBoundingClientRect().width, lang).toBeGreaterThanOrEqual(80)
      const value = box.querySelector('dd .v')
      if (!(value instanceof HTMLElement)) throw new Error('no value')
      expect(value.scrollWidth, `${lang}: ${value.textContent}`).toBeLessThanOrEqual(value.clientWidth)
    }
    // No cell runs past its own track either: a value that would not wrap
    // overflows its cell, not its row.
    for (const cell of stats(screen.container).querySelectorAll('th, td'))
      expect(cell.scrollWidth, `${lang}: ${cell.textContent}`).toBeLessThanOrEqual(cell.clientWidth)
    // A wide row's label keeps its one line; it is the value that wraps.
    for (const tr of stats(screen.container).querySelectorAll('tr.long')) {
      const label = tr.querySelector('th .st-lab')
      if (!(label instanceof HTMLElement)) throw new Error('a wide row has no label')
      const line = Number.parseFloat(getComputedStyle(label).lineHeight)
      expect(label.getBoundingClientRect().height, `${lang}: ${label.textContent}`).toBeLessThan(1.5 * line)
    }
    // The board's size stays on its label's line.
    const board = row(screen.container, 0)
    const top = (cell: Element | undefined) => cell?.getBoundingClientRect().top
    expect(top(board.cells[1]), lang).toBe(top(board.cells[0]?.querySelector('.st-lab') ?? undefined))
  }
})

// The longest pieces' headings stand over their right-aligned numbers.
test("the longest pieces' column headings are right-aligned over their numbers", async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  for (const th of screen.container.querySelectorAll('table.fw-longest thead th'))
    expect(getComputedStyle(th).textAlign).toBe('right')
})

// On the saved boards the drawer reports the open board (what the store keeps
// about it, and its longest pieces), not the run's result beside it in the slice.
test('on the saved boards the report describes the open board from its stored figures', async () => {
  const stored = storedFixture(1)
  await act(async () => finish(ONE))
  const screen = await mountReport(`/boards/8x8/${stored.meta.id}`)
  // No board the address names is drawn yet: nothing, not the run's report.
  expect(screen.container.querySelector('table.fw-stats')).toBeNull()
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
  const rows = [...stats(screen.container).rows].map((tr) => [labelOf(tr), tr.cells[1]?.textContent])
  const { meta } = stored
  expect(rows.map(([label]) => label)).toEqual([
    'board',
    'arrows',
    'average length',
    'longest',
    'backtracks / restarts',
    'time',
  ])
  expect(rows[0]?.[1]).toBe(`${meta.W} × ${meta.H} = 64 cells, seed ${meta.seed}`)
  expect(rows[1]?.[1]).toBe(String(meta.pieces))
  // The 23 rows of a run are not invented for a board that has no run.
  expect(stats(screen.container).rows).toHaveLength(6)
  // The same grid as a run's table, without its summary or groups.
  expect(screen.container.querySelector('.fw-rsum')).toBeNull()
  expect(stats(screen.container).querySelector('tr.grp')).toBeNull()
  const board = stats(screen.container).rows[0]
  expect(board?.className).toBe('long nodelta')
  for (const tr of stats(screen.container).rows) expect(getComputedStyle(tr).display).toBe('grid')
  await expect.element(screen.getByText(/keeps these figures only/)).toBeVisible()
  // The longest pieces are read off the board itself.
  expect(longestHead(screen.container).textContent).toMatch(/longest arrows$/)
})

test('a stored board explains its rows the same way', async () => {
  const stored = storedFixture(1)
  const screen = await mountReport(`/boards/8x8/${stored.meta.id}`)
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
  const pieces = stats(screen.container).rows[1]
  const button = pieces?.cells[0]?.querySelector('button.q')
  expect(button?.getAttribute('aria-controls')).toBe('stored-help-pieces')
  expect(document.getElementById('stored-help-pieces')?.textContent).toBe(
    'How many arrows the board has. More arrows = a longer game.',
  )
})

// A stored board carries no highlight, so the list takes the lab's count
// whatever its switch says — with the switch off the lab lists nothing.
test('the stored board lists its longest pieces with the highlight off', async () => {
  const stored = storedFixture(1)
  useStore.getState().view.setFlag('highlightLongest', false)
  const screen = await mountReport(`/boards/8x8/${stored.meta.id}`)
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
  expect(longestHead(screen.container).textContent).toBe('The 5 longest arrows')
})
