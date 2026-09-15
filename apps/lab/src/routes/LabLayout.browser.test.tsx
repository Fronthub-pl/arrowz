import { act } from 'react'
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/run.css'
import '../design/report.css'

// Every case here is about geometry at a stated size, so each sets its own
// viewport first: the size a case sets outlives it (harness facts).

function rect(container: HTMLElement, selector: string): DOMRect {
  const found = container.querySelector(selector)
  if (found === null) throw new Error(`${selector} is not on the page`)
  return found.getBoundingClientRect()
}

// Spec §5.2 and PR 4b, Ruling 2. At 860×900 the stage is 366px (advanced) and
// 385px (simple); the board keeps its 260px minimum and the report takes what
// is left, 73px and 92px measured. The wrap clips (`shell.css`'s
// `.fw-boardwrap { overflow: hidden }`), so the board's rect alone would prove
// nothing: it has to lie inside the wrap's content box, which is the wrap's
// rect less its 16px padding, because the wrap has no border.
test.each(['advanced', 'simple'] as const)(
  'at 860×900 the report is a row under the board and takes nothing the board needs (%s)',
  async (mode) => {
    await page.viewport(860, 900)
    const screen = await mountApp(mode)
    await loadRunDone()
    const stage = rect(screen.container, '.fw-stage')
    const wrap = rect(screen.container, '.fw-boardwrap')
    const board = rect(screen.container, '.fw-board')
    const report = rect(screen.container, '.fw-report')
    expect(report.width).toBeCloseTo(stage.width, 0)
    expect(report.top).toBeGreaterThanOrEqual(wrap.bottom)
    expect(report.height).toBeGreaterThan(0)
    expect(board.height).toBeGreaterThanOrEqual(259.5)
    expect(board.top).toBeGreaterThanOrEqual(wrap.top + 15.5)
    expect(board.bottom).toBeLessThanOrEqual(wrap.bottom - 15.5)
    expect(board.left).toBeGreaterThanOrEqual(wrap.left + 15.5)
    expect(board.right).toBeLessThanOrEqual(wrap.right - 15.5)
    // A row of knobs under the stage, whole. The report lives inside the
    // stage, so this holds as long as it stays there: a report placed in the
    // lab grid instead would push the console down and cut this row.
    const panel = rect(screen.container, '.fw-console .fw-knobs')
    const knobRow = rect(screen.container, '.fw-console .fw-k .top')
    expect(knobRow.top).toBeGreaterThanOrEqual(Math.max(panel.top, stage.bottom))
    expect(knobRow.bottom).toBeLessThanOrEqual(panel.bottom)
  },
  40_000,
)

test.each(['advanced', 'simple'] as const)(
  'above 900px the report is the third column beside the board (%s)',
  async (mode) => {
    await page.viewport(1400, 900)
    const screen = await mountApp(mode)
    await loadRunDone()
    const wrap = rect(screen.container, '.fw-boardwrap')
    const report = rect(screen.container, '.fw-report')
    // 22rem at the document's 16px.
    expect(report.width).toBeCloseTo(352, 0)
    expect(report.left).toBeGreaterThanOrEqual(wrap.right)
    expect(report.top).toBeCloseTo(wrap.top, 0)
    expect(report.height).toBeCloseTo(wrap.height, 0)
  },
  40_000,
)

// The ≤900px defect PR #67's browser pass found, and the same defect above
// 900px once the exports are in the column (PR 4b, Ruling 1). `.fw-cmdfig` is
// `flex: 0 1 auto` with `min-height: 0`, so the column shrinks the figure below
// its content while `.fw-cmd` keeps its 58px floor and paints behind Generate:
// measured 72.4px at 860×900 in both views and 66.9px at 1400×900 advanced,
// all with the exports in the column. What must hold is the run.css ruling as well:
// the box scrolls, and Generate does not move as the command grows.
const COMMAND_BOX_SIZES = [
  [860, 900, 'advanced'],
  [860, 900, 'simple'],
  [1400, 900, 'advanced'],
] as const

test.each(COMMAND_BOX_SIZES)(
  'at %i×%i (%s) the command box paints nothing over Generate, and Generate does not follow the command',
  async (width, height, mode) => {
    await page.viewport(width, height)
    const screen = await mountApp(mode)
    await loadRunDone()
    const box = () => rect(screen.container, '.fw-cmd')
    const go = () => rect(screen.container, '.fw-go')
    expect(box().bottom).toBeLessThanOrEqual(go().top)
    const goTop = go().top
    // The long command RunColumn.browser.test.tsx uses for the same question.
    await act(async () =>
      useStore.getState().params.setMany({
        W: 137,
        H: 251,
        seed: 987654,
        pStraight: 0.83,
        wShort: 0.45,
        wMid: 0.35,
        trapBias: 3,
        backbite: 6,
        giants: 4,
      }),
    )
    expect(box().bottom).toBeLessThanOrEqual(go().top)
    expect(go().top).toBe(goTop)
    const pre = screen.container.querySelector('.fw-cmd')
    if (pre === null) throw new Error('the command box is not on the page')
    expect(getComputedStyle(pre).overflowY).not.toBe('hidden')
  },
  40_000,
)
