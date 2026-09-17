import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
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
  state.view.setFlag('hilite', true)
  state.view.setNumber('top', '5')
})

/**
 * The panel asks the route now (`useInLibrary`), so it needs a router. No
 * address of its own: every case here is the lab, which is `/`, and the
 * library tab's empty report column is the whole application's case (Task 9).
 */
async function mountReport() {
  return render(
    <MemoryRouter>
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

/** The cells of one row of the first group: label, value, delta. Rows 1 and 3 are pieces and longest. */
function row(container: HTMLElement, at: number): HTMLTableRowElement {
  const found = stats(container).tBodies[0]?.rows[at]
  if (found === undefined) throw new Error(`no row ${at}`)
  return found
}

test('the report is a named region, empty until there is a result', async () => {
  const screen = await mountReport()
  await expect.element(screen.getByRole('region', { name: 'Report' })).toBeInTheDocument()
  expect(screen.container.querySelector('table')).toBeNull()
})

// Spec §5.2: the four separators become the boundaries of five groups.
test('twenty-three rows in five groups, labelled by row headers', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const table = stats(screen.container)
  expect(table.tBodies).toHaveLength(5)
  expect([...table.tBodies].reduce((sum, body) => sum + body.rows.length, 0)).toBe(23)
  expect(table.getAttribute('aria-label')).toBe('Statistics')
  const first = row(screen.container, 0)
  expect(first.cells[0]?.tagName).toBe('TH')
  expect(first.cells[0]?.getAttribute('scope')).toBe('row')
  expect(first.cells[1]?.textContent).toBe('8 × 8 = 64 cells, seed 1')
})

test('the first result has nothing to compare with', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  for (const cell of stats(screen.container).querySelectorAll('.fw-delta')) expect(cell.textContent).toBe('')
})

// Compared by row index against the result shown before (spec §5.3). Pieces is
// neutral: its sign and nothing else. Longest is `better: 1`, and it fell.
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
  expect(row(screen.container, 1).cells[0]?.textContent).toBe('elementów')
  expect(row(screen.container, 1).cells[2]?.textContent).toBe('+5.0')
  expect(row(screen.container, 3).cells[2]?.textContent).toBe('−1.0 gorzej')
})

// Ruling 5: no statistics, but the longest pieces are the board's and stay.
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
  expect(screen.container.querySelector('#longest-head')?.textContent).toBe('5 longest')
  await act(async () => useStore.getState().view.setNumber('top', '3'))
  expect(longest()?.querySelectorAll('tbody tr')).toHaveLength(3)
  await act(async () => useStore.getState().view.setFlag('hilite', false))
  expect(longest()).toBeNull()
})

const TOKEN = { better: '--ink', worse: '--error', neutral: '--ash' } as const

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
 * Checks a delta cell's kind, that it wears its own token (§7.1 — a contrast
 * check alone passes a worse cell left at `--ash`), and that it reads at AA.
 */
function readsAtAA(cell: HTMLTableCellElement | undefined, kind: 'better' | 'worse' | 'neutral') {
  if (cell === undefined) throw new Error('a delta cell is missing')
  expect(cell.className).toBe(`fw-delta ${kind}`)
  expect(getComputedStyle(cell).color, kind).toBe(tokenColour(TOKEN[kind]))
  const { front, back } = shown(cell)
  expect(contrast(front, back), kind).toBeGreaterThanOrEqual(4.5)
}

// §7.1, PR 4b: better `--ink`, worse `--error`, neutral `--ash`, on `--graphite`.
// Measured at the moment each class is on the cell: React keeps the `<td>`
// across results, so a cell read earlier carries whatever class it has now.
test('every kind of delta reads at AA', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  readsAtAA(row(screen.container, 3).cells[2], 'worse')
  readsAtAA(row(screen.container, 1).cells[2], 'neutral')
  await act(async () => finish(ONE))
  readsAtAA(row(screen.container, 3).cells[2], 'better')
})
