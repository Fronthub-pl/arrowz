import { act } from 'react'
import { expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import { settleTransitions } from '../harness/settle'
import { twoFrames } from '../harness/frames'
import { useStore } from '../state/store'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/run.css'
import '../design/report.css'

// Every case here is about geometry at a stated size, so each sets its own
// viewport first: the size a case sets outlives it.

function rect(container: HTMLElement, selector: string): DOMRect {
  const found = container.querySelector(selector)
  if (found === null) throw new Error(`${selector} is not on the page`)
  return found.getBoundingClientRect()
}

// Closed, the report is its 28px handle in the stage's last track and nothing
// more; the report itself is hidden, out of the tab order and the accessibility
// tree. The run column sits between the board and the handle, and the settings
// drawer's handle is the stage's other `.fw-drawer-handle`, hence the child selector.
test.each([[1400, 900, 'advanced']] as const)(
  'at %i×%i (%s) the closed report leaves only its handle beside the board',
  async (w, h, mode) => {
    await page.viewport(w, h)
    const screen = await mountApp(mode)
    await loadRunDone()
    const stage = rect(screen.container, '.fw-stage')
    const wrap = rect(screen.container, '.fw-boardwrap')
    const handle = rect(screen.container, '.fw-drawer > .fw-drawer-handle')
    const column = rect(screen.container, '.fw-stage > .fw-run-col')
    expect(handle.width).toBeCloseTo(28, 0)
    expect(handle.right).toBeCloseTo(stage.right, 0)
    expect(handle.height).toBeCloseTo(stage.height, 0)
    // The run column's track ends at the handle's: 28px plus the 1px gap, and
    // the board's ends at the column's, one gap before it.
    expect(stage.right - column.right).toBeCloseTo(29, 0)
    expect(column.left - wrap.right).toBeCloseTo(1, 0)
    expect(wrap.height).toBeCloseTo(stage.height, 0)
    const report = screen.container.querySelector('.fw-report')
    expect(report?.checkVisibility({ visibilityProperty: true })).toBe(false)
  },
  40_000,
)

// Open, the report is clamp(22rem, 24vw, 32rem) wide, and it lies over the
// board rather than moving it.
test.each([
  [1280, 800, 352],
  [1920, 1080, 460.8],
  [2560, 1200, 512],
] as const)(
  'at %d×%d the open report is %dpx wide, over a board that does not move',
  async (w, h, px) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    const before = rect(screen.container, '.fw-boardwrap')
    await screen.getByRole('button', { name: 'report', exact: true }).click()
    await settleTransitions()
    const report = rect(screen.container, '.fw-report')
    const stage = rect(screen.container, '.fw-stage')
    expect(report.width).toBeCloseTo(px, 0)
    expect(report.right).toBeCloseTo(stage.right, 0)
    // Field by field: a DOMRect's fields are prototype getters, so
    // `toEqual` on two rects compares no own properties and always passes.
    const after = rect(screen.container, '.fw-boardwrap')
    for (const side of ['left', 'top', 'width', 'height'] as const)
      expect(after[side], side).toBeCloseTo(before[side], 1)
    await expect.element(screen.getByRole('region', { name: 'Report' })).toBeVisible()
  },
  40_000,
)

// Closing slides the whole drawer out, report and all: the report turns hidden
// only once the 180ms slide is over, or only the bare 28px handle would cross
// the board. Read on the node right after the click, and again once the
// transitions have finished.
test('closing the drawer keeps the report on screen for the slide, then hides it', async () => {
  await page.viewport(1280, 800)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const handle = screen.getByRole('button', { name: 'report', exact: true })
  await handle.click()
  await settleTransitions()
  const report = screen.container.querySelector('.fw-report')
  if (report === null) throw new Error('.fw-report is not on the page')
  expect(report.checkVisibility({ visibilityProperty: true })).toBe(true)
  await handle.click()
  expect(useStore.getState().ui.report).toBe(false)
  expect(report.checkVisibility({ visibilityProperty: true }), 'right after the click').toBe(true)
  await settleTransitions()
  expect(report.checkVisibility({ visibilityProperty: true }), 'after the slide').toBe(false)
}, 40_000)

// A figure shrunk below its content once let `.fw-cmd` paint behind Generate.
// The figure and the command are `flex: none`: the box shows the whole command,
// a longer one pushes Generate down, and the column scrolls rather than the box.
const COMMAND_BOX_SIZES = [[1400, 900, 'advanced']] as const

test.each(COMMAND_BOX_SIZES)(
  'at %i×%i (%s) the command box paints nothing over Generate and shows the whole command',
  async (width, height, mode) => {
    await page.viewport(width, height)
    const screen = await mountApp(mode)
    await loadRunDone()
    const box = () => rect(screen.container, '.fw-cmd')
    const go = () => rect(screen.container, '.fw-go')
    expect(box().bottom).toBeLessThanOrEqual(go().top)
    const goTop = go().top
    // The long command the run column's own test uses.
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
    // The longer command took more lines, so Generate went down with it: the
    // box grew rather than scrolled.
    expect(go().top).toBeGreaterThan(goTop)
    const pre = screen.container.querySelector('.fw-cmd')
    if (pre === null) throw new Error('the command box is not on the page')
    expect(pre.scrollHeight).toBeLessThanOrEqual(pre.clientHeight + 1)
    const column = screen.container.querySelector('.fw-stage > .fw-run-col')
    if (column === null) throw new Error('the run column is not in the stage')
    expect(getComputedStyle(column).overflowY).toBe('auto')
  },
  40_000,
)

const SOLO_SIZES = [
  [1400, 900, 'advanced'],
  [1400, 900, 'simple'],
  [860, 900, 'advanced'],
  [860, 900, 'simple'],
] as const

// The board box fills the lab, not merely "the rest is hidden". The 34px are
// the wrap's 16px padding and the board's 1px border on each side. And nothing
// is remounted: the GL canvas and the run column are the same nodes throughout.
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
    // The board mode's strip under the frame keeps its height in solo too: in
    // View it is the control alone, 8px above 24px chips at both widths here.
    const strip = rect(screen.container, '.fw-modebar')
    expect(strip.height).toBeCloseTo(32, 0)
    // The annotation strip holds its height in solo too; read it rather than
    // pin it, since the touch breakpoint makes it 44px instead of 30.
    const frame = screen.container.querySelector('.fw-board')
    if (frame === null) throw new Error('.fw-board is not on the page')
    const annoStrip = parseFloat(getComputedStyle(frame).paddingTop)
    expect(board.height).toBeCloseTo(lab.height - 34 - strip.height - annoStrip, 0)
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

// `f` and `F`, and nothing else. Every refusal is followed by the same event
// without the thing refused, so a listener that ignored synthetic events
// altogether could not pass the refusals. Escape belongs to the palette (below).
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

// Solo must not answer Escape, and the palette must.
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
  // Uppercase `K`, as a real keyboard sends it with Shift or Caps Lock: the
  // guard checks both `'k'` and `'K'`, and no other case exercises this half.
  await userEvent.keyboard('{Meta>}K{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
}, 40_000)

// ⌘K is bound on every route, the docs included, because navigation is half
// of what the palette is for; unlike `f`, it is not gated by `onWorkspace`.
// `BrowserRouter` commits navigation inside `startTransition`, so the route
// change is polled before ⌘K is asserted on it.
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

// Needs the whole application: the trigger and the dialog on the page together.
// The dialog closes on a press outside its frame, and the trigger is outside
// it, so without the exception the press shut the palette and the click that
// followed opened it again: the button could never close what it opened.
test('the ⌘K button closes the palette it opened, rather than reopening it', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const trigger = screen.getByRole('button', { name: 'Command palette (⌘K)' })
  await trigger.click()
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  await trigger.click()
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  // And a press anywhere else outside the frame still closes it, so the
  // exception above is the trigger's alone.
  await trigger.click()
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  await screen.getByRole('heading', { level: 1, name: 'Arrowz' }).click()
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
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

// The same field silences `g`, `[` and `]` too: `isHotkeyRefused` refuses the
// palette's search box like any other input.
test('g, [ and ] typed into the palette are text, not hotkeys', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  const seed = useStore.getState().params.values.seed
  const phase = useStore.getState().run.phase
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  // `[` and `]` are userEvent's own key-descriptor delimiters, so a literal
  // one is each character doubled (testing-library/user-event's escape rule).
  await userEvent.keyboard('g[[]]')
  expect(useStore.getState().params.values.seed).toBe(seed)
  expect(useStore.getState().run.phase).toBe(phase)
  expect(useStore.getState().ui.palette).toBe(true)
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
  // ChoiceKnob and the start control, both selects.
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
// of `KeyboardEventInit`; `defaultPrevented` is the result of `preventDefault()`
// on a cancelable event, so a capture listener one step earlier produces it, as
// a real handler that already used the key would.
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

// Solo belongs to the stage, and the docs route has none.
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

// A focus inside what solo hides would fall to <body> at the next rendering
// step; it goes to the toggle instead, which is where solo is undone.
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

// The same guard set as `f`, and each refusal is followed by the very same
// event without the thing refused, so a listener ignoring synthetic events
// could not pass.
test('g generates, and refuses a modifier, a repeat, a cancelled event and a field', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const seedBefore = useStore.getState().params.values.seed

  for (const refused of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'g', ...refused })
  }
  expect(useStore.getState().run.phase).toBe('done')

  press(document.body, { key: 'g' })
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().params.values.seed).toBe(seedBefore)

  // Typed into a knob's own entry, `g` is text.
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await screen.getByRole('button', { name: /^seed:/ }).click()
  const runs = useStore.getState().run.phase
  await userEvent.keyboard('g')
  expect(useStore.getState().run.phase).toBe(runs)
}, 60_000)

test('] and [ step the seed by one and carve it', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  const before = useStore.getState().params.values.seed

  press(document.body, { key: ']' })
  expect(useStore.getState().params.values.seed).toBe(before + 1)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

  press(document.body, { key: '[' })
  expect(useStore.getState().params.values.seed).toBe(before)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

  // The machine path must not also wake auto-generate.
  const edits = useStore.getState().params.edits
  press(document.body, { key: ']' })
  expect(useStore.getState().params.edits).toBe(edits)
}, 60_000)

test('the run keys are the workspace’s, like f: the documentation route has none of them', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  // `location.pathname` flips inside react-router's history push, ahead of the
  // `startTransition` render that commits `onWorkspace`, so polling it races
  // `useRunKeys`'s guard. The hidden attribute is set by that committed render.
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  // The listener leaves in the commit's passive-effect cleanup, which runs
  // after the attribute is set; a synchronous `press` right after the poll can
  // land in between. Two frames let the cleanup run (`twoFrames`); the `f` case
  // gets the same wait from `userEvent.keyboard`'s round trip.
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  const seed = useStore.getState().params.values.seed
  press(document.body, { key: ']' })
  expect(useStore.getState().params.values.seed).toBe(seed)
}, 40_000)

// The run column is the stage's third track, clamp(16rem, 22vw, 28rem): at
// 1920 it is 422.4, at 2560 the 28rem cap holds. The L band (1280–1599) sets it
// to 18rem, so 288 at 1400; M and S (below 1280) have only the bar under the board.
test.each([
  [1400, 900, 288],
  [1920, 1080, 422.4],
  [2560, 1200, 448],
] as const)(
  'at %d×%d the run column is %dpx wide',
  async (w, h, px) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    expect(rect(screen.container, '.fw-run-col').width).toBeCloseTo(px, 0)
  },
  40_000,
)

// The primary action in the UI's own face, heavier than the buttons under it,
// and a full touch target at every pointer.
test('Generate is set in JetBrains Mono, 500, 13px, 44px high', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const go = screen.getByRole('button', { name: 'Generate' }).element()
  const style = getComputedStyle(go)
  expect(style.fontFamily).toContain('JetBrains Mono')
  expect(style.fontWeight).toBe('500')
  expect(style.fontSize).toBe('13px')
  expect(go.getBoundingClientRect().height).toBeCloseTo(44, 0)
}, 40_000)

const report = () => useStore.getState().ui.report

// `r` and `R` toggle the drawer under the same guard as `f`; each refusal is
// followed by the same event without the thing refused.
test('r toggles the report, and a modifier, a repeat or a field does nothing', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('r')
  expect(report()).toBe(true)
  await userEvent.keyboard('R')
  expect(report()).toBe(false)
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'r', ...modifier })
    expect(report(), JSON.stringify(modifier)).toBe(false)
  }
  press(document.body, { key: 'r' })
  expect(report()).toBe(true)
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.keyboard('r')
  expect(report()).toBe(true)
}, 40_000)

test('Escape closes the report, but not while the palette or the preset panel has it', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('r')
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)

  await userEvent.keyboard('r')
  await userEvent.keyboard('{Meta>}k{/Meta}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(true)
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => useStore.getState().ui.palette).toBe(false)
  expect(report()).toBe(true)

  await screen.getByRole('button', { name: /^preset/ }).click()
  await userEvent.keyboard('{Escape}')
  await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
  expect(report()).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)
}, 40_000)

test('r does nothing on the docs route', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  await userEvent.keyboard('r')
  expect(report()).toBe(false)
}, 40_000)

// The saved boards take the lab's stage: the settings drawer on the left, the
// open board's column on the right, the report drawer; and `r` toggles the one
// report state both tabs share. The route changes inside a transition, hence
// the polls after each tab click.
test('the saved boards share the lab’s drawers and their keys', async () => {
  await page.viewport(1400, 900)
  // The listing's fetch never answers: this case is about the face, not the store.
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  try {
    const screen = await mountApp('advanced')
    await loadRunDone()
    await userEvent.keyboard('r')
    expect(report()).toBe(true)

    await screen.getByRole('tab', { name: 'Saved boards', exact: true }).click()
    await expect.poll(() => screen.container.querySelector('.fw-lab.library')).not.toBeNull()
    await settleTransitions()
    const drawer = screen.container.querySelector('.fw-drawer')
    expect(drawer?.checkVisibility(), 'the report on the saved boards').toBe(true)
    // The right track is the open board's column, and the run column is hidden.
    await expect.element(screen.getByRole('region', { name: 'The open board' })).toBeVisible()
    expect(screen.container.querySelector('.fw-run-col:not(.fw-bcol)')?.checkVisibility()).toBe(false)
    const board = rect(screen.container, '.fw-board')
    const settingsDrawer = rect(screen.container, '.fw-ldrawer')
    expect(board.left).toBeGreaterThanOrEqual(settingsDrawer.right)
    await userEvent.keyboard('r')
    expect(report(), 'r on the saved boards').toBe(false)
    await userEvent.keyboard('s')
    expect(settings(), 's on the saved boards').toBe(false)
    await userEvent.keyboard('s')

    await screen.getByRole('tab', { name: 'Lab', exact: true }).click()
    await expect.poll(() => screen.container.querySelector('.fw-lab.library')).toBeNull()
    await settleTransitions()
    expect(report()).toBe(false)
    expect(settings()).toBe(true)
    await expect.element(screen.getByRole('region', { name: 'Run' })).toBeVisible()
  } finally {
    fetchSpy.mockRestore()
  }
}, 40_000)

// Solo hides the preset strip; an open panel must not be waiting behind it when
// solo turns off. `f` is pressed with the focus on a preset button (not a
// field). The strip's focusout closes the panel: `BoardFrame` moves the focus
// to the solo toggle before the strip is hidden, so no solo rule is needed.
test('turning solo on closes an open preset panel', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const trigger = screen.getByRole('button', { name: /^preset/ })
  await trigger.click()
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
}, 40_000)

test('closing the report with the focus inside it moves the focus to the handle', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('button', { name: 'report', exact: true }).click()
  const inside = document.getElementById('lab-report')
  if (inside === null) throw new Error('no report')
  inside.tabIndex = -1
  inside.focus()
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'report', exact: true }).element())
}, 40_000)

// Thin scrollbars in the lab's own colours.
test('the lab scrolls with thin scrollbars in the border colour', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const knobs = screen.container.querySelector('.fw-knobs')
  if (knobs === null) throw new Error('no knob panel')
  const style = getComputedStyle(knobs)
  expect(style.scrollbarWidth).toBe('thin')
  expect(style.scrollbarColor).toBe('rgb(58, 62, 71) rgba(0, 0, 0, 0)')
}, 40_000)

const settings = () => useStore.getState().ui.settings

// `s` and `S` toggle the settings drawer under the guard `r` uses; each
// refusal is followed by the same event without the thing refused.
test('s toggles the settings, and a modifier, a repeat or a field does nothing', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  expect(settings()).toBe(true)
  await userEvent.keyboard('s')
  expect(settings()).toBe(false)
  await userEvent.keyboard('S')
  expect(settings()).toBe(true)
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 's', ...modifier })
    expect(settings(), JSON.stringify(modifier)).toBe(true)
  }
  press(document.body, { key: 's' })
  expect(settings()).toBe(false)
  press(document.body, { key: 's' })
  expect(settings()).toBe(true)
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.keyboard('s')
  expect(settings()).toBe(true)
}, 40_000)

// One layer per press, the report before the settings: the report lies over
// the board, the settings drawer beside it. A third press has nothing left.
test('Escape closes the report first, then the settings, one per press', async () => {
  await page.viewport(1400, 900)
  await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('r')
  expect(report()).toBe(true)
  expect(settings()).toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)
  expect(settings(), 'the first press').toBe(true)
  await userEvent.keyboard('{Escape}')
  expect(settings(), 'the second press').toBe(false)
  await userEvent.keyboard('{Escape}')
  expect(report()).toBe(false)
  expect(settings()).toBe(false)
}, 40_000)

// Bound where `r` is: the workspace, not the docs.
test('s does nothing on the docs route', async () => {
  await page.viewport(1400, 900)
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  try {
    const screen = await mountApp('advanced')
    await loadRunDone()
    await screen.getByRole('tab', { name: 'Docs', exact: true }).click()
    await expect
      .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
      .toBe(true)
    await userEvent.keyboard('s')
    expect(settings(), 's on the docs').toBe(true)
  } finally {
    vi.restoreAllMocks()
  }
}, 40_000)

// Unlike the report, the open settings drawer does not cover the board: from
// 1024px up the board's track gives way by the drawer's width. Closed it is its
// 28px handle on the stage's left edge, the console hidden once the slide is over.
test.each([
  [1024, 768],
  [1400, 900],
  [1920, 1080],
] as const)(
  'at %i×%i the open settings push the board aside, and closed leave only their handle',
  async (w, h) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await settleTransitions()
    const drawer = rect(screen.container, '.fw-ldrawer')
    const board = rect(screen.container, '.fw-board')
    expect(board.left).toBeGreaterThanOrEqual(drawer.right)
    expect(board.width).toBeGreaterThan(0)
    const open = board.width

    await screen.getByRole('button', { name: 'settings', exact: true }).click()
    await settleTransitions()
    const stage = rect(screen.container, '.fw-stage')
    const handle = rect(screen.container, '.fw-ldrawer > .fw-drawer-handle')
    expect(handle.left).toBeCloseTo(stage.left, 0)
    expect(handle.width).toBeCloseTo(28, 0)
    expect(rect(screen.container, '.fw-board').width).toBeGreaterThan(open)
    const panel = screen.container.querySelector('.fw-ldrawer > .fw-console')
    expect(panel?.checkVisibility({ visibilityProperty: true })).toBe(false)
  },
  40_000,
)

// The board keeps its 16px on the left whatever the settings drawer does: open,
// the board's track gives way by the drawer's width plus 16px. So the gap is
// the same open and closed, the wrap's 16px plus the stage's 1px column gap,
// measured against the drawer's edge when open and its handle's when closed.
test.each([
  [1920, 1080, 655],
  [1440, 900, 517],
  [1280, 800, 379],
  [1024, 768, 424],
] as const)(
  'at %i×%i the board keeps 16px from the settings drawer, open or closed, and is %ipx wide open',
  async (w, h, px) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    await settleTransitions()
    const board = rect(screen.container, '.fw-board')
    expect(board.left - rect(screen.container, '.fw-ldrawer').right, 'open').toBeCloseTo(16 + 1, 0)
    expect(board.width, 'the frame, open').toBeCloseTo(px, 0)

    await screen.getByRole('button', { name: 'settings', exact: true }).click()
    await settleTransitions()
    const handle = rect(screen.container, '.fw-ldrawer > .fw-drawer-handle')
    expect(rect(screen.container, '.fw-board').left - handle.right, 'closed').toBeCloseTo(16 + 1, 0)
  },
  40_000,
)

// The run's state lives in the run column. 1 − 734/1250 prints as 41.3.
const PROGRESS = { pieces: 52, remaining: 734, backtracks: 18, ms: 1400, total: 1250 }

/** A carve in flight, as the worker's first report leaves the store. */
async function carving(): Promise<void> {
  await act(async () => {
    useStore.getState().run.started(useStore.getState().params.values)
    useStore.getState().run.progressed(PROGRESS)
  })
}

function one(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`${selector} is not on the page`)
  return found
}

// From 768 up the bar leaves the layout — the view has one row and the lab
// starts at its top — while its live output stays in the document, speaking.
test.each([
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [768, 1024],
] as const)(
  'at %i×%i the status bar is out of sight and the lab takes its row',
  async (w, h) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    const bar = rect(screen.container, '.fw-bar')
    expect(bar.width).toBe(1)
    expect(bar.height).toBe(1)
    const output = screen.getByRole('status', { name: 'Run status' })
    await expect.element(output).toMatchTextContent(/Board complete/)
    const view = rect(screen.container, '.fw-view')
    const lab = rect(screen.container, '.fw-lab')
    expect(lab.top).toBeCloseTo(view.top, 0)
    expect(lab.height).toBeCloseTo(view.height, 0)
  },
  40_000,
)

// Under 768 the run column is a sheet that may be `display: none`, so the bar
// stays where it was, over the preset strip: 41px, one line at 600.
test.each([
  [600, 900],
  [375, 812],
] as const)(
  'at %i×%i the status bar stays on screen over the lab',
  async (w, h) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await loadRunDone()
    const bar = rect(screen.container, '.fw-bar')
    expect(bar.width).toBeCloseTo(w, 0)
    expect(bar.height).toBeGreaterThanOrEqual(41)
    if (w === 600) expect(bar.height).toBeCloseTo(41, 0)
    expect(bar.bottom).toBeLessThanOrEqual(rect(screen.container, '.fw-lab').top + 0.5)
  },
  40_000,
)

// At 1440×900 in Polish: Generate is the meter, 260px wide, the stage says it
// is busy, and the line under Generate is the rest of the progress, two lines
// tall with its 6 + 8px padding.
test('at 1440×900 in Polish Generate is the meter and the line under it wraps in two', async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  useStore.getState().lang.setLang('pl')
  await carving()
  const go = screen.getByRole('button', { name: 'Generuję 41,3%' })
  await expect.element(go).toBeDisabled()
  expect(go.element().getBoundingClientRect().width).toBeCloseTo(260, 0)
  await expect
    .element(screen.getByRole('progressbar', { name: 'Postęp generowania' }))
    .toHaveAttribute('aria-valuenow', '41.3')
  expect(one(screen.container, '.fw-stage').getAttribute('aria-busy')).toBe('true')
  const line = one(screen.container, '#run-column > .fw-runstate')
  expect(line.textContent).toBe('52 strz. · zostało 734 · nawroty 18 · 1,4 s')
  const lineHeight = Number.parseFloat(getComputedStyle(line).lineHeight)
  expect(line.getBoundingClientRect().height).toBeCloseTo(2 * lineHeight + 6 + 8, 0)
  // The full sentence, percent included, is still the live region's.
  await expect.element(screen.getByRole('status', { name: 'Stan generowania' })).toMatchTextContent(/41,3%/)
  await act(async () => useStore.getState().run.aborted())
  expect(one(screen.container, '.fw-stage').hasAttribute('aria-busy')).toBe(false)
  useStore.getState().lang.setLang('en')
}, 40_000)

// At 1024 the run column is the bar under the board: Generate is 149px and the
// line is the bar's own last row, one line, clipped with an ellipsis.
test('at 1024×768 the line is the bar’s last row, one line', async () => {
  await page.viewport(1024, 768)
  const screen = await mountApp('advanced')
  await loadRunDone()
  useStore.getState().lang.setLang('pl')
  await carving()
  const go = screen.getByRole('button', { name: 'Generuję 41,3%' })
  expect(go.element().getBoundingClientRect().width).toBeCloseTo(149, 0)
  const line = one(screen.container, '#run-column > .fw-runstate')
  const box = line.getBoundingClientRect()
  expect(box.height).toBeCloseTo(Number.parseFloat(getComputedStyle(line).lineHeight), 0)
  for (const item of one(screen.container, '#run-column').children) {
    if (item === line || item.getClientRects().length === 0) continue
    expect(box.top, item.className).toBeGreaterThanOrEqual(item.getBoundingClientRect().bottom - 0.5)
  }
  // A whole row of the bar: its content box, which an open settings drawer
  // pushes right as it pushes the board.
  const bar = one(screen.container, '#run-column')
  const style = getComputedStyle(bar)
  const content = bar.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  expect(box.width).toBeCloseTo(content, 0)
  // The line's words fit at every band as the dictionary stands; a worker's
  // error message has no such bound, and stays one line, cut with an ellipsis.
  await act(async () =>
    useStore
      .getState()
      .run.failed('the carve could not place the next piece after every restart the envelope allows, at seed 7'),
  )
  expect(line.getBoundingClientRect().height).toBeCloseTo(Number.parseFloat(getComputedStyle(line).lineHeight), 0)
  expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
  expect(getComputedStyle(line).textOverflow).toBe('ellipsis')
  useStore.getState().lang.setLang('en')
}, 40_000)

// The saved boards' events have their own line in the board column: with the
// status bar out of sight from 768 up, this is where a person reads them.
test('at 1440×900 a library event is read under the board column', async () => {
  await page.viewport(1440, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Saved boards' }).click()
  await act(async () => useStore.getState().library.notify({ kind: 'deleteFailed' }))
  const line = one(screen.container, '#board-column .fw-runstate')
  await expect.poll(() => line.textContent).toMatch(/Could not delete/)
  expect(line.checkVisibility()).toBe(true)
  expect(line.classList.contains('bad')).toBe(true)
  expect(line.getAttribute('aria-hidden')).toBe('true')
}, 40_000)
