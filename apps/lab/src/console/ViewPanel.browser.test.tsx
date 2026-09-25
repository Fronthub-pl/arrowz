import {
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  PAD_RANGE,
  POINT_RADIUS_RANGE,
  themeOf,
} from '@arrowz/board-element'
import { buildCommand, VIEW_RANGE } from '@arrowz/engine/command'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { PALETTE_CAP, viewOf } from '../state/view.slice'
import { useStore } from '../state/store'
import { ViewPanel } from './ViewPanel'
// The disabled-button case reads a real computed colour, which needs the
// stylesheets and the tokens they read. Elsewhere `getComputedStyle` reads
// React's inline styles, which pass with no CSS at all.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'

const view = () => useStore.getState().view
const EN = dictionary('en')

// Colour inputs on the panel before any palette colour: the point grid's dot,
// the paper, the ink and the highlight.
const ALWAYS_PRESENT_COLOR_INPUTS = 4

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
  // Through `setState`, not the actions under test: a reset built on them would
  // fail alongside a broken action. `setTheme` does not touch the palette, so
  // both are reset; `showPoints` is left on by the point grid case below.
  useStore.setState((state) => ({
    view: {
      ...state.view,
      theme: '',
      palette: [],
      paper: '',
      ink: '',
      highlightColor: '',
      showPoints: false,
      pointColor: DEFAULT_POINT_COLOR,
      pointRadius: DEFAULT_POINT_RADIUS,
      pad: DEFAULT_PAD,
    },
  }))
})

test('the panel draws all twelve preview controls, as rows', async () => {
  const screen = await render(<ViewPanel />)
  // Seven numbers: the engine's five plus the point radius and the margin,
  // bounded by the element; and five switches.
  expect(screen.container.querySelectorAll('.kv-row input[type="range"]')).toHaveLength(7)
  expect(screen.container.querySelectorAll('[role="switch"]')).toHaveLength(5)
  expect(screen.container.querySelectorAll('input[type="number"]')).toHaveLength(0)
})

test('the panel draws the point grid controls, in a block that opens with the grid', async () => {
  const screen = await render(<ViewPanel />)
  const grid = screen.getByRole('switch', { name: 'point grid' })
  await expect.element(grid).toHaveAttribute('aria-checked', 'false')
  expect(document.getElementById('dep-points')?.hidden).toBe(true)
  await grid.click()
  expect(view().showPoints).toBe(true)
  expect(document.getElementById('dep-points')?.hidden).toBe(false)

  const radius = screen.container.querySelector<HTMLInputElement>('#view-point-radius')
  expect(radius).not.toBeNull()
  expect(Number(radius?.min)).toBe(POINT_RADIUS_RANGE.min)
  expect(Number(radius?.max)).toBe(POINT_RADIUS_RANGE.max)
  expect(radius?.checkValidity()).toBe(true)
})

// Nothing before this case in the file touches `highlightLongest`, so the
// switch here is the slice's own starting value, not one a prior case left
// behind.
test('a fresh preview starts with the highlight off, and switching it on shows the top count', async () => {
  const screen = await render(<ViewPanel />)
  const highlightLongest = screen.getByRole('switch', { name: 'longest' })
  await expect.element(highlightLongest).toHaveAttribute('aria-checked', 'false')
  expect(document.getElementById('dep-highlight-longest')?.hidden).toBe(true)
  expect(buildCommand(useStore.getState().params.values, viewOf(view()))).not.toContain('--top')

  try {
    await highlightLongest.click()
    await expect.element(highlightLongest).toHaveAttribute('aria-checked', 'true')
    expect(document.getElementById('dep-highlight-longest')?.hidden).toBe(false)
    expect(buildCommand(useStore.getState().params.values, viewOf(view()))).toContain('--top=5')
  } finally {
    useStore.getState().view.setFlag('highlightLongest', false)
  }
})

test('the point radius row shows the clamped value after commit, not what was typed', async () => {
  useStore.setState((state) => ({ view: { ...state.view, showPoints: true } }))
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^dot radius:/ }).click()
  await userEvent.fill(
    screen.getByRole('textbox', { name: 'dot radius', exact: true }),
    String(POINT_RADIUS_RANGE.max + 9),
  )
  await userEvent.keyboard('{Enter}')
  expect(view().pointRadius).toBe(POINT_RADIUS_RANGE.max)
  await expect
    .element(screen.getByRole('button', { name: /^dot radius:/ }))
    .toHaveTextContent(String(POINT_RADIUS_RANGE.max))
  await expect.element(screen.getByRole('slider', { name: 'dot radius' })).toHaveValue(String(POINT_RADIUS_RANGE.max))
})

test('the point radius row follows an external store change', async () => {
  const screen = await render(<ViewPanel />)
  const radius = screen.container.querySelector<HTMLInputElement>('#view-point-radius')
  if (!radius) throw new Error('no point radius input')
  view().setPointRadius(String(POINT_RADIUS_RANGE.min))
  await expect.element(radius).toHaveValue(String(POINT_RADIUS_RANGE.min))
})

test('the margin row draws in the grid section, bounded by the element', async () => {
  const screen = await render(<ViewPanel />)
  const pad = screen.container.querySelector<HTMLInputElement>('#view-pad')
  expect(pad).not.toBeNull()
  // `view-sec-grid` is the section's heading, not an ancestor.
  const grid = screen.container.querySelector('#view-sec-grid')?.closest('.kv-sect')
  expect(grid).not.toBeNull()
  expect(pad?.closest('.kv-sect')).toBe(grid)
  expect(Number(pad?.min)).toBe(PAD_RANGE.min)
  expect(Number(pad?.max)).toBe(PAD_RANGE.max)
  expect(pad?.checkValidity()).toBe(true)
})

test('the margin row shows the clamped value after commit, not what was typed', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^margin:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'margin', exact: true }), String(PAD_RANGE.max + 9))
  await userEvent.keyboard('{Enter}')
  expect(view().pad).toBe(PAD_RANGE.max)
  await expect.element(screen.getByRole('button', { name: /^margin:/ })).toHaveTextContent(String(PAD_RANGE.max))
  await expect.element(screen.getByRole('slider', { name: 'margin' })).toHaveValue(String(PAD_RANGE.max))
})

test('the margin row follows an external store change', async () => {
  const screen = await render(<ViewPanel />)
  const pad = screen.container.querySelector<HTMLInputElement>('#view-pad')
  if (!pad) throw new Error('no margin input')
  view().setPad(PAD_RANGE.min)
  await expect.element(pad).toHaveValue(String(PAD_RANGE.min))
})

test('a switch is a switch, not a checkbox pretending to be one, and says its state', async () => {
  const screen = await render(<ViewPanel />)
  const rounded = screen.getByRole('switch', { name: 'rounded' })
  await expect.element(rounded).toHaveAttribute('aria-checked', 'true')
  const value = () => rounded.element().closest('.kv-row')?.querySelector('.vc')?.textContent
  expect(value()).toBe('on')
  await rounded.click()
  expect(view().rounded).toBe(false)
  expect(value()).toBe('off')
})

test('a number row commits a typed value, clamped to what the CLI takes', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^export cell:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'export cell', exact: true }), '300')
  await userEvent.keyboard('{Enter}')
  // 200 is the CLI's ceiling, and the track's own as well.
  expect(view().cell).toBe(200)
  await expect.element(screen.getByRole('slider', { name: 'export cell' })).toHaveValue('200')
})

test('every number row declares the bounds the engine actually takes', async () => {
  // The DOM is what a person and a screen reader are told, so it is what has
  // to agree with `VIEW_RANGE`.
  const screen = await render(<ViewPanel />)
  const tracks = [...screen.container.querySelectorAll<HTMLInputElement>('input[type="range"]')].filter(
    (input) => input.id !== 'view-point-radius' && input.id !== 'view-pad',
  )
  expect(tracks).toHaveLength(Object.keys(VIEW_RANGE).length)
  for (const input of tracks) {
    const key = input.id.replace(/^view-/, '') as keyof typeof VIEW_RANGE
    const range = VIEW_RANGE[key]
    expect(range, `no VIEW_RANGE entry for ${input.id}`).toBeDefined()
    expect(Number(input.min)).toBe(range.min)
    expect(Number(input.max)).toBe(range.max)
    expect(input.checkValidity(), `${input.id} opens invalid at ${input.value}`).toBe(true)
  }
})

test('a value being typed is not written until it is committed', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^stroke:/ }).click()
  // By name: a colour input is a textbox to the accessibility tree too.
  const entry = screen.getByRole('textbox', { name: 'stroke', exact: true })
  await userEvent.fill(entry, '0.')
  expect(view().stroke).toBe(0.5)
  await userEvent.fill(entry, '0.8')
  await userEvent.keyboard('{Enter}')
  expect(view().stroke).toBe(0.8)
})

test('a stroke typed with a decimal comma is written, a cell size with one is not', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^stroke:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'stroke', exact: true }), '0,35')
  await userEvent.keyboard('{Enter}')
  expect(view().stroke).toBe(0.35)
  await screen.getByRole('button', { name: /^export cell:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'export cell', exact: true }), '1,5')
  await userEvent.keyboard('{Enter}')
  expect(view().cell).toBe(12)
})

test('the dot radius takes a decimal comma', async () => {
  useStore.setState((state) => ({ view: { ...state.view, showPoints: true } }))
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: /^dot radius:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'dot radius', exact: true }), '0,15')
  await userEvent.keyboard('{Enter}')
  expect(view().pointRadius).toBe(0.15)
})

test('the head width’s auto chip toggles 0, and releases to the width auto draws', async () => {
  // At XS the `.kv-g .mx` rule hides the chip; this pins the desktop look.
  await page.viewport(1400, 900)
  view().setNumber('headWidth', '0')
  view().setNumber('stroke', '0.2')
  const screen = await render(<ViewPanel />)
  const chip = screen.getByRole('button', { name: 'auto (head width)' })
  await expect.element(chip).toHaveAttribute('aria-pressed', 'true')
  await expect.element(screen.getByRole('button', { name: /^head width:/ })).toHaveTextContent('auto')
  await chip.click()
  expect(view().headWidth).toBe(0.6)
  await chip.click()
  expect(view().headWidth).toBe(0)
})

test('the panel is the tabpanel the rail points at', async () => {
  const screen = await render(<ViewPanel />)
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('id', 'rail-panel-preview')
  await expect.element(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'rail-tab-preview')
})

test('the theme picker lists every theme and writes the store', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await expect.element(picker).toBeInTheDocument()
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(useStore.getState().view.theme).toBe('gruvbox-dark')
})

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
  // The inline colours pass with no CSS; the strip's rule
  // (`.kv-g .fw-swatches`) also needs a `.kv-g` ancestor.
  expect(strip.closest('.kv-g')).not.toBeNull()
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

// `userEvent.fill` on an `input[type="color"]` sets its value and fires the
// `change` React listens to, so these cases drive the real control.
test('adding a colour appends a swatch, keeps a chosen theme, and edits write the store', async () => {
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(view().theme).toBe('gruvbox-dark')

  const add = screen.getByRole('button', { name: 'add colour' })
  await add.click()
  expect(view().palette).toEqual(['#000000'])
  expect(view().theme).toBe('gruvbox-dark')
  const inputs = screen.container.querySelectorAll<HTMLInputElement>('input[type="color"]')
  expect(inputs).toHaveLength(ALWAYS_PRESENT_COLOR_INPUTS + view().palette.length)

  // Scoped to the palette row: the panel has other colour inputs.
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
  // Scoped to the palette rows, as above.
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

// The add chip is dressed through `.fw .kv-chip`, so the render wraps it in `.fw`.
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

test('the add button names the cap help text as its accessible description', async () => {
  const screen = await render(<ViewPanel />)
  const add = screen.getByRole('button', { name: 'add colour' })
  const describedBy = add.element().getAttribute('aria-describedby')
  expect(describedBy).not.toBeNull()
  const help = describedBy === null ? null : screen.container.querySelector(`#${describedBy}`)
  expect(help?.textContent).toContain(`Up to ${PALETTE_CAP} colours`)
})

test('choosing a theme keeps a custom palette built in the editor', async () => {
  const screen = await render(<ViewPanel />)
  await screen.getByRole('button', { name: 'add colour' }).click()
  expect(view().palette).toEqual(['#000000'])
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  expect(view().palette).toEqual(['#000000'])
  expect(screen.container.querySelectorAll('input[type="color"]')).toHaveLength(ALWAYS_PRESENT_COLOR_INPUTS + 1)
})

test('the editor never mutates a theme’s own palette array', async () => {
  const theme = themeFixture('gruvbox-dark')
  const before = [...theme.palette]
  const screen = await render(<ViewPanel />)
  const picker = screen.getByRole('combobox')
  await userEvent.selectOptions(picker, 'gruvbox-dark')
  await screen.getByRole('button', { name: 'add colour' }).click()
  // Scoped to the palette row, as above.
  const inputs = screen.container.querySelectorAll<HTMLInputElement>('.fw-palette-row input[type="color"]')
  const swatch = inputs[0]
  if (!swatch) throw new Error('no colour input')
  await userEvent.fill(swatch, '#abcdef')
  expect(themeFixture('gruvbox-dark').palette).toEqual(before)
})

test('the palette editor stays out of the accessibility tree when empty and shows up once a colour is added', async () => {
  const screen = await render(<ViewPanel />)
  // No list while there is no colour: an empty list would be read as one.
  expect(screen.container.querySelector('.fw-palette-list')).toBeNull()
  expect(
    screen.getByRole('button', { name: 'add colour' }).element().closest('.kv-row')?.querySelector('.vc')?.textContent,
  ).toBe(`0 / ${PALETTE_CAP}`)
  await screen.getByRole('button', { name: 'add colour' }).click()
  expect(screen.container.querySelectorAll('.fw-palette-list input[type="color"]')).toHaveLength(1)
  expect(
    screen.container.querySelector('#view-palette-label')?.closest('.kv-row')?.querySelector('.vc')?.textContent,
  ).toBe(`1 / ${PALETTE_CAP}`)
})

test('the editor offers paper and ink, and hands them back to the theme when cleared', async () => {
  const screen = await render(<ViewPanel />)
  const paper = screen.container.querySelector<HTMLInputElement>('#view-paper')
  expect(paper).not.toBeNull()
  if (paper === null) return
  // The native setter: React patches `.value`, so a plain assignment updates
  // its change tracker too and the `input` event reads as no change.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(paper, '#010203')
  paper.dispatchEvent(new Event('input', { bubbles: true }))
  expect(view().paper).toBe('#010203')

  await screen.getByRole('button', { name: /clear the paper/i }).click()
  // Back to "not set", which is what lets a theme supply it again.
  expect(view().paper).toBe('')
})

test('the editor offers a highlight colour, and hands it back to the theme when cleared', async () => {
  const screen = await render(<ViewPanel />)
  const highlight = screen.container.querySelector<HTMLInputElement>('#view-highlight-color')
  expect(highlight).not.toBeNull()
  if (highlight === null) return
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(highlight, '#010203')
  highlight.dispatchEvent(new Event('input', { bubbles: true }))
  expect(view().highlightColor).toBe('#010203')

  await screen.getByRole('button', { name: /clear the highlight/i }).click()
  expect(view().highlightColor).toBe('')
})

test('the preview is five titled sections, in order, each a named group', async () => {
  const screen = await render(<ViewPanel />)
  const groups = [...screen.container.querySelectorAll('.kv-sect[role="group"]')]
  const titles = groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent)
  expect(titles).toEqual(['arrows', 'highlight', 'grid', 'colours', 'export'])
})

test('no row sits inside another row', async () => {
  useStore.getState().view.addPaletteColor()
  const screen = await render(<ViewPanel />)
  expect(screen.container.querySelectorAll('.kv-row .kv-row')).toHaveLength(0)
})

// The top count does nothing while the highlight is off (the link and the
// CLI write it as 0 then), so it sits in a block under the switch.
test('the top count sits under longest, in a block that closes with it', async () => {
  const screen = await render(<ViewPanel />)
  const block = () => document.getElementById('dep-highlight-longest')
  expect(block()?.querySelector('#view-top')).not.toBeNull()
  const highlightLongest = screen.getByRole('switch', { name: 'longest' })
  try {
    if (highlightLongest.element().getAttribute('aria-checked') !== 'true') await highlightLongest.click()
    expect(block()?.hidden).toBe(false)
    await highlightLongest.click()
    expect(block()?.hidden).toBe(true)
    const header = screen.container.querySelector('[aria-controls="dep-highlight-longest"]')
    expect(header?.textContent).toContain(EN.t('needsHighlightLongest'))
  } finally {
    useStore.getState().view.setFlag('highlightLongest', false)
  }
})

test('the colours section holds the theme, both surface colours and the palette', async () => {
  const screen = await render(<ViewPanel />)
  const section = screen.container.querySelector('#view-sec-colours')?.closest('.kv-sect')
  if (!section) throw new Error('no colours section')
  for (const id of ['#view-theme', '#view-paper', '#view-ink', '#view-highlight-color', '#view-palette-label']) {
    expect(section.querySelector(id), id).not.toBeNull()
  }
  expect(section.querySelector('button.kv-chip')?.getAttribute('aria-describedby')).toBe('view-palette-help')
})

test('a row’s control points at its own description, which its ? opens', async () => {
  const screen = await render(<ViewPanel />)
  const cell = screen.container.querySelector('#view-cell')
  expect(cell?.getAttribute('aria-describedby')).toBe('view-cell-help')
  const help = document.getElementById('view-cell-help')
  expect(help?.textContent).toBe(EN.t('cellHelp'))
  expect(help?.closest('.kv-row')?.contains(cell ?? null)).toBe(true)
  expect(help?.classList.contains('fw-vh')).toBe(true)
  await screen.getByRole('button', { name: 'About export cell' }).click()
  expect(help?.classList.contains('fw-vh')).toBe(false)
})

test('every preview control names a description that exists', async () => {
  const screen = await render(<ViewPanel />)
  const ids = [
    '#view-cell',
    '#view-stroke',
    '#view-headWidth',
    '#view-headHeight',
    '#view-top',
    '#view-point-radius',
    '#view-point-color',
    '#view-theme',
    '#view-paper',
    '#view-ink',
    '#view-highlight-color',
    '#view-pad',
    '#view-rounded',
    '#view-colored',
    '#view-highlightLongest',
    '#view-voids',
    '#view-showPoints',
  ]
  for (const id of ids) {
    const described = screen.container.querySelector(id)?.getAttribute('aria-describedby') ?? ''
    expect(described, id).not.toBe('')
    expect(document.getElementById(described)?.textContent, id).toBeTruthy()
  }
  const add = screen.getByRole('button', { name: 'add colour' }).element().getAttribute('aria-describedby') ?? ''
  expect(document.getElementById(add)).not.toBeNull()
})
