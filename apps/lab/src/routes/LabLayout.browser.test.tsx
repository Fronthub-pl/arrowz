import { act } from 'react'
import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
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

function twoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

const SOLO_SIZES = [
  [1400, 900, 'advanced'],
  [1400, 900, 'simple'],
  [860, 900, 'advanced'],
  [860, 900, 'simple'],
] as const

// Spec §5.1: the board box fills the lab, not merely "the rest is hidden". The
// 34px are the wrap's 16px padding and the board's 1px border on each side,
// measured at every one of these sizes. And nothing is remounted: the GL
// canvas and the run column are the same nodes before, during and after.
test.each(SOLO_SIZES)(
  'at %i×%i (%s) solo gives the board the whole lab and remounts nothing',
  async (width, height, mode) => {
    await page.viewport(width, height)
    const screen = await mountApp(mode)
    await loadRunDone()
    const element = screen.container.querySelector('arrowz-board')
    const canvas = element?.shadowRoot?.querySelector('canvas')
    const column = screen.getByRole('region', { name: 'Run' }).element()
    expect(canvas).toBeTruthy()
    // Named before it is clicked, so a missing toggle reports in 5 s rather
    // than after `click()`'s 40 s actionability wait.
    await expect
      .element(screen.getByRole('button', { name: 'Full view (key F)' }), { timeout: 5_000 })
      .toBeInTheDocument()

    await screen.getByRole('button', { name: 'Full view (key F)' }).click()
    await twoFrames()
    const lab = rect(screen.container, '.fw-lab')
    const wrap = rect(screen.container, '.fw-boardwrap')
    const board = rect(screen.container, 'arrowz-board')
    for (const side of ['top', 'left', 'width', 'height'] as const) expect(wrap[side]).toBeCloseTo(lab[side], 0)
    expect(board.width).toBeCloseTo(lab.width - 34, 0)
    expect(board.height).toBeCloseTo(lab.height - 34, 0)
    expect(rect(screen.container, '.fw-report').height).toBe(0)
    expect(rect(screen.container, '.fw-console').height).toBe(0)
    // The status line stays, so a carve in flight is still reported.
    await expect.element(screen.getByRole('status', { name: 'Run status' })).toBeVisible()

    expect(element?.shadowRoot?.querySelector('canvas')).toBe(canvas)
    // `includeHidden`: a role locator skips a `display: none` region, and the
    // column is exactly that while solo is on.
    expect(screen.getByRole('region', { name: 'Run', includeHidden: true }).element()).toBe(column)
    await screen.getByRole('button', { name: 'Full view (key F)' }).click()
    await expect.element(screen.getByRole('region', { name: 'Run' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
    expect(element?.shadowRoot?.querySelector('canvas')).toBe(canvas)
  },
  40_000,
)

/** A key the way a listener on the document receives it, for the cases a real keyboard cannot type. */
function press(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

const solo = () => useStore.getState().ui.solo

// Spec §5.1: `f` and `F`, and nothing else. Every refusal is followed by the
// same event without the thing refused, so a listener that ignored synthetic
// events altogether could not pass the refusals. Escape used to be asserted
// here too, before the palette gave it an owner (see the two cases below).
test('f toggles solo, and a modifier or a repeat does nothing', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await userEvent.keyboard('F')
  expect(solo()).toBe(false)

  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'f', ...modifier })
    expect(solo(), JSON.stringify(modifier)).toBe(false)
  }
  press(document.body, { key: 'f' })
  expect(solo()).toBe(true)

  await screen.getByRole('button', { name: 'Full view (key F)' }).click()
  expect(solo()).toBe(false)
}, 40_000)

// The reservation this splits was written when nothing owned Escape
// ("The palette of PR 7 owns Escape; nothing else binds it"). Both halves
// still matter: solo must not answer Escape, and the palette must.
test('Escape with the palette closed still leaves solo alone', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(solo()).toBe(true)
  expect(useStore.getState().ui.palette).toBe(false)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)

test('⌘K opens the palette anywhere, Escape closes it, and solo is untouched either way', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  expect(solo()).toBe(false)
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  expect(solo()).toBe(false)
  // Uppercase `K`, the way a real keyboard sends it with Shift held or Caps
  // Lock on: `App.tsx`'s guard checks both `'k'` and `'K'`, and this half of
  // it has no other case exercising it.
  await userEvent.keyboard('{Meta>}K{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
}, 40_000)

// Spec §7: ⌘K is bound on every route, the docs included, because navigation
// is half of what the palette is for — unlike `f` (solo, workspace-only),
// this listener is not gated by `onWorkspace`. `BrowserRouter` commits
// navigation inside `startTransition`, so the route change is polled before
// ⌘K is asserted on it.
test('⌘K opens the palette on the docs route too', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
}, 40_000)

// The palette's search box is a field, and the `f` guard refuses fields — so
// typing `f` into the palette must not take the board full screen.
test('f typed into the palette is text, not a toggle', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)

test('f typed into a field or an editable region is text, not a toggle', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
  await userEvent.keyboard('{Escape}')

  // The board group has no `<select>`; `difficulty` holds `trapBias`'s
  // ChoiceKnob and the start control, both selects (engine.ts:2517-2519).
  await screen.getByRole('tab', { name: 'difficulty', exact: true }).click()
  await expect.element(screen.getByRole('tabpanel', { name: 'difficulty' })).toBeVisible()
  const select = screen.container.querySelector('select')
  const editable = document.createElement('div')
  editable.contentEditable = 'true'
  document.body.append(editable)
  try {
    for (const target of [select, editable]) {
      if (target === null) throw new Error('no select on the difficulty group')
      press(target, { key: 'f' })
      expect(solo(), target.nodeName).toBe(false)
    }
    press(document.body, { key: 'f' })
    expect(solo()).toBe(true)
  } finally {
    editable.remove()
  }
}, 40_000)

// Two refusals the modifier loop above cannot express. `isComposing` is a field
// of `KeyboardEventInit`, so it goes in directly; `defaultPrevented` is not a
// field at all — it is the result of `preventDefault()` on a cancelable event,
// so a capture listener one step earlier has to produce it, which is also how a
// real handler that already used the key would.
test('f being composed, or already handled by someone else, is not a toggle', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  // An IME composing a character sends the keystrokes of the character being
  // composed: `f` on the way to something else is text, like `f` in a field.
  press(document.body, { key: 'f', isComposing: true })
  expect(solo(), 'isComposing').toBe(false)

  const cancel = (event: KeyboardEvent) => event.preventDefault()
  document.addEventListener('keydown', cancel, { capture: true })
  try {
    press(document.body, { key: 'f', cancelable: true })
    expect(solo(), 'defaultPrevented').toBe(false)
  } finally {
    document.removeEventListener('keydown', cancel, { capture: true })
  }
  // The same event without the thing refused, so a listener deaf to synthetic
  // events altogether could not pass either refusal above.
  press(document.body, { key: 'f' })
  expect(solo()).toBe(true)
}, 40_000)

// Solo belongs to the stage, and the docs route has none. (Until PR 5a the
// saved boards had none either, which is what this case used to assert.)
test('f does nothing on the docs route', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)

// Spec §5.1: a focus inside what solo hides would fall to <body> at the next
// rendering step; it goes to the toggle instead, which is where solo is undone.
test('a focus inside what solo hides moves to the toggle', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const generate = screen.getByRole('button', { name: 'Generate' }).element()
  if (!(generate instanceof HTMLButtonElement)) throw new Error('Generate is not a button')
  generate.focus()
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await twoFrames()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full view (key F)' }).element())
}, 40_000)
