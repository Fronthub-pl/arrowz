import { DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS, POINT_RADIUS_RANGE, themeOf } from '@arrowz/board-element'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PALETTE_CAP } from '../state/view.slice'
import { useStore } from '../state/store'
import { ColoursCard, ViewFlagSwitch, ViewNumberField, ViewPanel } from './ViewPanel'
// The disabled-button case below reads `.fw .fw-btn:disabled`'s actual computed
// colour (shell.css), which needs both the stylesheet and the tokens it reads
// through `var(...)` — no other case in this file reads real CSS at all
// (harness fact: `getComputedStyle` above reads React's own inline styles).
import '../design/tokens.css'
import '../design/shell.css'

const view = () => useStore.getState().view
const EN = dictionary('en')

// Colour inputs that exist on the panel before the user adds anything to the
// palette: the point grid's dot colour (Task 5), the paper and the ink
// (Task 7). Palette rows are added on top of these three, so the
// palette-counting tests below compute against this rather than a bare
// number.
const ALWAYS_PRESENT_COLOR_INPUTS = 3

/** `#rrggbb` as the browser reports it back through `getComputedStyle`. */
function rgbOf(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** A theme the fixture files must actually carry, or the test itself is broken. */
function themeFixture(name: string) {
  const theme = themeOf(name)
  if (!theme) throw new Error(`no such theme: ${name}`)
  return theme
}

// The store outlives a test; every file that writes it puts it back.
beforeEach(() => {
  view().setNumber('cell', '12')
  view().setNumber('stroke', '0.5')
  view().setNumber('top', '5')
  if (!view().rounded) view().toggle('rounded')
  if (view().colored) view().toggle('colored')
  // Reset both directly: `setTheme` no longer touches the palette (Ruling 6
  // repealed that), so resetting the theme alone would leave a palette built
  // by an earlier test on screen for the next one.
  //
  // The five new fields go through the same direct `setState`, never through
  // `setPaper`/`setInk`/`setFlag`: a reset built on the actions under test
  // would fail alongside a broken action instead of pinning the one test
  // that exercises it. `showPoints` is the one field here with a real leak —
  // "the panel draws the point grid controls" below clicks it on and never
  // clicks it back off, so every later test in this file ran with the grid on
  // until this reset covered it.
  useStore.setState((state) => ({
    view: {
      ...state.view,
      theme: '',
      palette: [],
      paper: '',
      ink: '',
      showPoints: false,
      pointColor: DEFAULT_POINT_COLOR,
      pointRadius: DEFAULT_POINT_RADIUS,
    },
  }))
})

test('the panel draws all eleven preview controls', async () => {
  const screen = await render(<ViewPanel />)
  // Six numbers now: the five the engine's table covers plus the point radius,
  // whose bounds come from the element instead (spec §4.3).
  expect(screen.container.querySelectorAll('input[type="number"]')).toHaveLength(6)
  expect(screen.container.querySelectorAll('[role="switch"]')).toHaveLength(5)
})

test('the panel draws the point grid controls', async () => {
  const screen = await render(<ViewPanel />)
  const grid = screen.getByRole('switch', { name: /show the point grid/i })
  await expect.element(grid).toHaveAttribute('aria-checked', 'false')
  await grid.click()
  expect(view().showPoints).toBe(true)

  const radius = screen.container.querySelector<HTMLInputElement>('#view-point-radius')
  expect(radius).not.toBeNull()
  expect(Number(radius?.min)).toBe(POINT_RADIUS_RANGE.min)
  expect(Number(radius?.max)).toBe(POINT_RADIUS_RANGE.max)
  expect(radius?.checkValidity()).toBe(true)
})

// Finding 1 (fix wave after the whole-branch review): unlike its sibling
// number fields, this box was uncontrolled with neither of `ViewNumberField`'s
// two mechanisms — it never wrote the clamped value back on commit, and never
// re-synced from the store when something external changed it. Typing past
// the ceiling and blurring used to leave the store clamped but the box still
// showing the out-of-range number it was never told to give up (and
// `:invalid` against its own `max`).
test('the point radius box shows the clamped value after commit, not what was typed', async () => {
  const screen = await render(<ViewPanel />)
  const radius = screen.getByRole('spinbutton', { name: /dot radius/i })
  await userEvent.fill(radius, String(POINT_RADIUS_RANGE.max + 9))
  await userEvent.tab()
  expect(view().pointRadius).toBe(POINT_RADIUS_RANGE.max)
  await expect.element(radius).toHaveValue(POINT_RADIUS_RANGE.max)
  expect(screen.container.querySelector<HTMLInputElement>('#view-point-radius')?.checkValidity()).toBe(true)
})

// An external change (a link naming a different radius, or any other write to
// the store) must reach the box too — the same sync `ViewNumberField` runs
// while the field is not focused.
test('the point radius box follows an external store change while unfocused', async () => {
  const screen = await render(<ViewPanel />)
  const radius = screen.container.querySelector<HTMLInputElement>('#view-point-radius')
  if (!radius) throw new Error('no point radius input')
  view().setPointRadius(String(POINT_RADIUS_RANGE.min))
  await expect.element(radius).toHaveValue(POINT_RADIUS_RANGE.min)
})

test('a switch is a switch, not a checkbox pretending to be one', async () => {
  const screen = await render(<ViewPanel />)
  const rounded = screen.getByRole('switch', { name: /round the corners/i })
  await expect.element(rounded).toHaveAttribute('aria-checked', 'true')
  await rounded.click()
  expect(view().rounded).toBe(false)
})

test('a number field commits on blur, clamped to what the CLI takes', async () => {
  const screen = await render(<ViewPanel />)
  const cell = screen.getByRole('spinbutton', { name: /cell size/i })
  await userEvent.fill(cell, '300')
  await userEvent.tab()
  // 200 is the CLI's ceiling, and now the field's own as well, so the box that
  // shows the clamped value is not `:invalid` for showing it.
  expect(view().cell).toBe(200)
  expect(screen.container.querySelector<HTMLInputElement>('#view-cell')?.checkValidity()).toBe(true)
  await expect.element(cell).toHaveValue(200)
})

test('every number field declares the bounds the engine actually takes', async () => {
  // The only guard that the lab's number fields stay inside the engine's
  // table. It checks the rendered attributes rather than the `VIEW_FIELDS`
  // table, because the table no longer carries bounds: what a person and a
  // screen reader are told is what the DOM says, and that is what has to agree
  // with `VIEW_RANGE`.
  const screen = await render(<ViewPanel />)
  const fields = [...screen.container.querySelectorAll<HTMLInputElement>('input[type="number"]')].filter(
    (input) => input.id !== 'view-point-radius',
  )
  expect(fields).toHaveLength(Object.keys(VIEW_RANGE).length)
  for (const input of fields) {
    const key = input.id.replace(/^view-/, '') as keyof typeof VIEW_RANGE
    const range = VIEW_RANGE[key]
    expect(range, `no VIEW_RANGE entry for ${input.id}`).toBeDefined()
    expect(Number(input.min)).toBe(range.min)
    expect(Number(input.max)).toBe(range.max)
    // Not just "in range": a field is `:invalid` on a value off its own step
    // too, and the default it opens with must not be one.
    expect(input.checkValidity(), `${input.id} opens invalid at ${input.value}`).toBe(true)
  }
})

test('a field being typed into is not rewritten under the cursor', async () => {
  const screen = await render(<ViewPanel />)
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await stroke.click()
  // Digit by digit, the way a person types: after `0.` a controlled number
  // input reads back the empty string, and React would put the default in the
  // box mid-word. The store must not have moved yet either.
  // ControlOrMeta, not Control: on macOS Ctrl+A moves the caret to the line
  // start, so the field would read `080.5` and this test would pass on CI and
  // fail on the machine it was written on.
  await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}0.')
  expect(view().stroke).toBe(0.5)
  await userEvent.keyboard('8{Enter}')
  expect(view().stroke).toBe(0.8)
})

test('the panel is the tabpanel the rail points at', async () => {
  const screen = await render(<ViewPanel />)
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('id', 'rail-panel-preview')
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'rail-tab-preview')
})

// Ruling 2: the field is the caller's now. A second owner (the library's
// detail, Task 6) gives it a different value and a different sink, and the
// clamp has to happen inside the field — otherwise each owner would have to
// remember to clamp, and one of them would not.
test('a field hands its owner an already-clamped number', async () => {
  let got = null as number | null
  const screen = await render(
    <ViewNumberField
      field={{ field: 'stroke', label: 'strokeLabel', step: 0.05 }}
      value={0.5}
      onCommit={(v) => (got = v)}
    />,
  )
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await userEvent.fill(stroke, '9')
  await userEvent.tab()
  // The ceiling is read from the table rather than spelled out: what the case
  // is about is that the owner never sees the 9 that was typed, whatever the
  // bound happens to be. It was a literal `2` until the view bounds were
  // narrowed to what stays readable, and then it was a literal about nothing.
  expect(got).toBe(VIEW_RANGE.stroke.max)
  // And the lab's own slice was not touched by a field nobody pointed at it.
  expect(view().stroke).toBe(0.5)
})

test('a flag switch reports a press without writing any store', async () => {
  let presses = 0
  const screen = await render(
    <ViewFlagSwitch flag="colored" label="colored" on={false} onToggle={() => (presses += 1)} />,
  )
  await screen.getByRole('switch', { name: /colour the arrows/i }).click()
  expect(presses).toBe(1)
  expect(view().colored).toBe(false)
})

test('the theme picker lists every theme and writes the store', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await expect.element(picker).toBeInTheDocument()
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(useStore.getState().view.theme).toBe('gruvbox-dark')
})

// Design doc §6: "the twelve names with a swatch strip." The strip shows the
// *chosen* theme's arrow colours, in order, on that theme's own paper.
test('choosing a theme shows a strip of its arrow colours, in order, on its paper', async () => {
  const screen = await render(<ViewPanel />)
  expect(screen.container.querySelector('.fw-swatches')).toBeNull()
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  const strip = screen.container.querySelector<HTMLElement>('.fw-swatches')
  if (!strip) throw new Error('no swatch strip after choosing a theme')
  const theme = themeFixture('gruvbox-dark')
  expect(getComputedStyle(strip).backgroundColor).toBe(rgbOf(theme.paper))
  const swatches = [...strip.querySelectorAll<HTMLElement>('.fw-swatch')]
  expect(swatches.map((s) => getComputedStyle(s).backgroundColor)).toEqual(theme.palette.map(rgbOf))
  // Finding 4 (final whole-addendum review): this file loads no stylesheet
  // (unlike `BoardFrame.browser.test.tsx`), so the two assertions above read
  // React's inline `backgroundColor` and would pass even with no CSS at all.
  // What no computed-style read here can see is that `.fw-k .fw-swatch`
  // (console.css) needs a `.fw-k` ancestor to apply — this pins the DOM shape
  // that selector actually depends on.
  expect(strip.closest('.fw-k')).not.toBeNull()
  // Finding 9 (final whole-addendum review): the strip's `aria-hidden` is
  // load-bearing (the `<select>` beside it already names the theme), and
  // until now no test asserted it — a future edit could drop it silently.
  expect(strip.getAttribute('aria-hidden')).toBe('true')
})

test('clearing the theme removes the strip', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(screen.container.querySelector('.fw-swatches')).not.toBeNull()
  await userEvent.selectOptions(picker, '')
  expect(screen.container.querySelector('.fw-swatches')).toBeNull()
})

// One of the two single-colour themes (everforest-light, ayu-light): the strip
// must still look deliberate with one swatch, not like a broken multi-swatch strip.
test('a single-colour theme still shows one swatch, not a broken strip', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'ayu-light')
  const strip = screen.container.querySelector<HTMLElement>('.fw-swatches')
  if (!strip) throw new Error('no swatch strip for a single-colour theme')
  const swatches = [...strip.querySelectorAll<HTMLElement>('.fw-swatch')]
  expect(swatches).toHaveLength(1)
  const [swatch] = swatches
  if (!swatch) throw new Error('no swatch element')
  const theme = themeFixture('ayu-light')
  const [color] = theme.palette
  if (!color) throw new Error('ayu-light has no palette colour')
  expect(getComputedStyle(swatch).backgroundColor).toBe(rgbOf(color))
})

// The lab's editable custom palette (design doc §6, palette round-2
// addendum, task 2). `userEvent.fill` drives `input[type="color"]` in this
// harness the same as it drives a number field — checked empirically before
// writing this file, rather than assumed: a probe component confirmed
// `userEvent.fill(colorInput, '#ff00ff')` both sets the input's `.value` and
// fires the `change` React listens to, so this exercises the real control
// rather than writing the store directly.
test('adding a colour appends a swatch, keeps a chosen theme, and edits write the store', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(view().theme).toBe('gruvbox-dark')

  const add = screen.getByRole('button', { name: 'add colour' })
  await add.click()
  expect(view().palette).toEqual(['#000000'])
  // Ruling 6, exercised through the UI: adding a colour left the theme the
  // picker had just set untouched, not merely what the slice does when
  // called directly.
  expect(view().theme).toBe('gruvbox-dark')
  // The panel now also carries the point grid's own colour input, so the
  // total is that plus one palette swatch, not one on its own.
  const inputs = screen.container.querySelectorAll<HTMLInputElement>('input[type="color"]')
  expect(inputs).toHaveLength(ALWAYS_PRESENT_COLOR_INPUTS + view().palette.length)

  // Scoped to the palette row, not the panel's other colour inputs, so this
  // picks up the swatch just added rather than whichever input happens to
  // sit first in the DOM.
  const swatch = screen.container.querySelector<HTMLInputElement>('.fw-palette-row input[type="color"]')
  if (!swatch) throw new Error('no colour input')
  await userEvent.fill(swatch, '#ff00ff')
  expect(view().palette).toEqual(['#ff00ff'])
})

test('the remove button drops one colour and leaves the rest', async () => {
  const screen = await render(<ViewPanel />)
  const add = screen.getByRole('button', { name: 'add colour' })
  await add.click()
  await add.click()
  // Scoped to the palette rows: the panel's other colour inputs (the point
  // grid's) must not shift which "second" input this grabs.
  const paletteInputs = () => screen.container.querySelectorAll<HTMLInputElement>('.fw-palette-row input[type="color"]')
  const second = paletteInputs()[1]
  if (!second) throw new Error('no second colour input')
  await userEvent.fill(second, '#123456')
  expect(view().palette).toEqual(['#000000', '#123456'])

  await screen.getByRole('button', { name: 'remove colour 1' }).click()
  expect(view().palette).toEqual(['#123456'])
  expect(screen.container.querySelectorAll<HTMLInputElement>('input[type="color"]')).toHaveLength(
    ALWAYS_PRESENT_COLOR_INPUTS + view().palette.length,
  )
})

test(`the add button is refused past the cap of ${PALETTE_CAP} colours`, async () => {
  const screen = await render(<ViewPanel />)
  const add = screen.getByRole('button', { name: 'add colour' })
  for (let i = 0; i < PALETTE_CAP; i++) await add.click()
  expect(view().palette).toHaveLength(PALETTE_CAP)
  await expect.element(add).toBeDisabled()
})

// Live pass: `.fw .fw-btn:disabled` set only `cursor: default`, so "add
// colour" at the cap read exactly like an enabled button — same colour, same
// opacity, nothing a person looking at it could tell apart from an enabled
// control they simply had not clicked yet. `.fw` is the ancestor `shell.css`
// dresses the button through (`.fw .fw-btn`), so the render below wraps it.
test('a disabled console button reads as disabled, not merely inert', async () => {
  const screen = await render(
    <div className="fw">
      <ViewPanel />
    </div>,
  )
  const add = screen.getByRole('button', { name: 'add colour' })
  const enabledColor = getComputedStyle(add.element()).color

  for (let i = 0; i < PALETTE_CAP; i++) await add.click()
  await expect.element(add).toBeDisabled()
  const disabledColor = getComputedStyle(add.element()).color

  expect(disabledColor).not.toBe(enabledColor)
})

// Finding 9 (final whole-addendum review): `disabled` alone gives a screen
// reader no reason for the refusal at the cap; `aria-describedby` names the
// help paragraph, which already states the cap in words.
test('the add button names the cap help text as its accessible description', async () => {
  const screen = await render(<ViewPanel />)
  const add = screen.getByRole('button', { name: 'add colour' })
  const describedBy = add.element().getAttribute('aria-describedby')
  expect(describedBy).not.toBeNull()
  const help = describedBy === null ? null : screen.container.querySelector(`#${describedBy}`)
  expect(help?.textContent).toContain(`Up to ${PALETTE_CAP} colours`)
})

// Ruling 6 the other way: the store test covers the slice directly, this
// covers it reached from the UI, so a caller that goes through `ColoursCard`
// and one that goes through the picker are both pinned.
test('choosing a theme keeps a custom palette built in the editor', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: 'add colour' }).click()
  expect(view().palette).toEqual(['#000000'])
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(view().palette).toEqual(['#000000'])
  // The palette's own swatch survives the theme choice alongside the panel's
  // other colour input (the point grid's).
  expect(screen.container.querySelectorAll('input[type="color"]')).toHaveLength(ALWAYS_PRESENT_COLOR_INPUTS + 1)
})

test('the editor never mutates a theme’s own palette array', async () => {
  const theme = themeFixture('gruvbox-dark')
  const before = [...theme.palette]
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  await screen.getByRole('button', { name: 'add colour' }).click()
  // Scoped to the palette row: the panel's other colour input (the point
  // grid's) must not be the one this test edits.
  const inputs = screen.container.querySelectorAll<HTMLInputElement>('.fw-palette-row input[type="color"]')
  const swatch = inputs[0]
  if (!swatch) throw new Error('no colour input')
  await userEvent.fill(swatch, '#abcdef')
  expect(themeFixture('gruvbox-dark').palette).toEqual(before)
})

test('the palette editor stays out of the accessibility tree when empty and shows up once a colour is added', async () => {
  const screen = await render(<ColoursCard />)
  // Rendered alone, the colours card carries paper and ink but not the point grid's
  // dot colour -- that one lives in `ViewPanel` itself (`ALWAYS_PRESENT_COLOR_INPUTS`
  // above counts all three, so one is subtracted here).
  const beforeAnyPaletteColor = ALWAYS_PRESENT_COLOR_INPUTS - 1
  expect(screen.container.querySelectorAll('input[type="color"]')).toHaveLength(beforeAnyPaletteColor)
  await screen.getByRole('button', { name: 'add colour' }).click()
  expect(screen.container.querySelectorAll('input[type="color"]')).toHaveLength(beforeAnyPaletteColor + 1)
})

test('the editor offers paper and ink, and hands them back to the theme when cleared', async () => {
  const screen = await render(<ViewPanel />)
  const paper = screen.container.querySelector<HTMLInputElement>('#view-paper')
  expect(paper).not.toBeNull()
  if (paper === null) return
  // The native setter, not a plain assignment: React patches `.value` to keep
  // its own change-tracker in step, so a plain assignment would update that
  // tracker too and the dispatched `input` event would then look like a
  // no-op change (`slide` in SimplePanel.browser.test.tsx hits the same seam).
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(paper, '#010203')
  paper.dispatchEvent(new Event('input', { bubbles: true }))
  expect(view().paper).toBe('#010203')

  await screen.getByRole('button', { name: /clear the paper/i }).click()
  // Back to "not set", which is what lets a theme supply it again.
  expect(view().paper).toBe('')
})

// Spec R8: four sections instead of one grid of fourteen cards.
test('the preview is four titled sections, in order', async () => {
  const screen = await render(<ViewPanel />)
  const titles = [...screen.container.querySelectorAll('.fw-khd b')].map((b) => b.textContent)
  expect(titles).toEqual(['geometry', 'drawing', 'points', 'colours'])
})

test('no card sits inside another card', async () => {
  useStore.getState().view.addPaletteColor()
  const screen = await render(<ViewPanel />)
  expect(screen.container.querySelectorAll('.fw-k .fw-k')).toHaveLength(0)
})

test('the four drawing flags are one card, the point grid is with the points', async () => {
  const screen = await render(<ViewPanel />)
  const flags = screen.container.querySelector('.fw-k.fw-flags')
  expect(flags?.querySelectorAll('[role="switch"]')).toHaveLength(4)
  expect(flags?.querySelector('#view-showPoints')).toBeNull()
})

test('the colours card holds the theme, both surface colours and the palette', async () => {
  const screen = await render(<ViewPanel />)
  const card = screen.container.querySelector('.fw-k.fw-colours')
  if (card === null) throw new Error('no colours card')
  for (const id of ['#view-theme', '#view-paper', '#view-ink']) expect(card.querySelector(id)).not.toBeNull()
  expect(card.querySelector('button.fw-btn')?.getAttribute('aria-describedby')).toBe('view-palette-help')
})

test('a field with help points at it under its section heading', async () => {
  const screen = await render(<ViewPanel />)
  const cell = screen.container.querySelector('#view-cell')
  expect(cell?.getAttribute('aria-describedby')).toBe('view-cell-help')
  expect(screen.container.querySelector('.fw-khd #view-cell-help')?.textContent).toBe(EN.t('cellHelp'))
  expect(screen.container.querySelectorAll('.fw-k .why')).toHaveLength(0)
})

// The descriptions switch is gone (handoff 2, PR 2), so the preview's help is
// always in sight until the preview moves to rows with a `?` of their own
// (PR 3); every control still names an element that exists.
test('every preview control names a description that exists', async () => {
  const screen = await render(<ViewPanel />)
  for (const id of ['#view-cell', '#view-headHeight', '#view-point-radius']) {
    const described = screen.container.querySelector(id)?.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(described), id).not.toBeNull()
  }
  const add = screen.container.querySelector('.fw-colours button.fw-btn')?.getAttribute('aria-describedby') ?? ''
  expect(document.getElementById(add)).not.toBeNull()
})

test('with help on, the preview help is in sight', async () => {
  const screen = await render(<ViewPanel />)
  const lists = [...screen.container.querySelectorAll('.fw-khd .fw-kdesc')]
  expect(lists).toHaveLength(3)
  for (const list of lists) expect(list.classList.contains('fw-vh')).toBe(false)
})
