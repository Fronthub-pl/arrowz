import { themeOf } from '@arrowz/board-element'
import { dictionary } from '@arrowz/engine/i18n'
import { simpleParams } from '@arrowz/engine/simple'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SimplePanel } from './SimplePanel'

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

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

const state = () => useStore.getState()
const EN = dictionary('en')

/** The knobs the recipe on screen gives with the seed on screen — what every write below must leave. */
const drawn = () => simpleParams({ ...state().recipe.value, seed: state().params.values.seed }, null)

/**
 * A range input moved the way a drag moves it: the native value setter, then
 * the `input` event React listens to. `fill` does not drive a range input, and
 * a click lands wherever the pointer is.
 */
function slide(input: HTMLInputElement | null, value: number) {
  if (!input) throw new Error('no such slider')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  state().params.reset()
  state().recipe.reset()
  state().recipe.setRandom(false)
  state().ui.raiseClamped(false)
  // The store outlives a test; a theme chosen by one test must not leak into
  // the next one's assumption that no theme is chosen yet. Reset directly
  // rather than through `setTheme`, whose clearing of the palette is Ruling
  // B — the very invariant a mutation test targets — so a reset built on it
  // would not isolate that mutation's failures to the cases that assert it.
  useStore.setState((s) => ({ view: { ...s.view, theme: '', palette: [] } }))
})

describe('SimplePanel', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  })

  // A size is typed like a knob (§5.5) and moves the recipe, the knobs and the
  // export cell at once; the run is the debounce's (Task 4), so none here.
  it('writes a typed width into the recipe and the knobs, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    // Relative: `recipe.edits` only grows, and `reset()` leaves it alone on purpose.
    const shaped = state().recipe.edits
    await screen.getByRole('button', { name: /^width/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '120')
    await userEvent.keyboard('{Enter}')
    expect(state().recipe.value.W).toBe(120)
    expect(state().params.values).toEqual(drawn())
    expect(state().view.cell).toBe(13)
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  it('moves the recipe and the knobs with a slider, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const shaped = state().recipe.edits
    slide(screen.container.querySelector<HTMLInputElement>('#simple-lengths'), 20)
    await expect.poll(() => state().recipe.value.lengths).toBe(0.2)
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  // Spec §2.2: the segmented button is immediate, and the knobs are rewritten
  // before the run reads them.
  it('runs at once when the skeleton is switched, on the knobs it gives', async () => {
    const seen: unknown[] = []
    const control: RunControl = {
      start: () => void seen.push({ ...state().params.values }),
      abort: () => {},
      hold: () => {},
    }
    const shaped = state().recipe.edits
    const screen = await render(<SimplePanel control={control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(state().recipe.value.skeleton).toBe('on')
    expect(seen).toEqual([drawn()])
    expect(state().recipe.edits).toBe(shaped)
  })

  // The machine path (Ruling 4): a seed typed here must not wake an `auto`
  // left on in the advanced view, and the old seed field starts nothing.
  it('writes a typed seed into the knobs without counting it as a knob edit', async () => {
    const g = stub()
    state().ui.setAuto(true)
    const typed = state().params.edits
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('button', { name: /^seed/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '4242')
    await userEvent.keyboard('{Enter}')
    expect(state().params.values.seed).toBe(4242)
    expect(state().params.edits).toBe(typed)
    expect(g.started()).toBe(0)
    state().ui.setAuto(false)
  })

  it('switches randomising without running', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('switch', { name: /randomise the settings/ }).click()
    expect(state().recipe.value.random).toBe(true)
    expect(g.started()).toBe(0)
  })

  // Spec R7, applied to the one card `RandomCard` still kept its own
  // paragraph for: the switch below now points at the panel heading's list,
  // the way `ValueKnob` points at `descId` rather than carrying its own
  // description in the card, and `p.why` is left for state alone (there is
  // none here, so the card has no `.why` left to carry it in).
  it('points the randomise switch at the panel heading, not at its own card', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const random = screen.getByRole('switch', { name: /randomise the settings/ })
    const describedBy = random.element().getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    const help = describedBy === null ? null : document.getElementById(describedBy)
    expect(help?.textContent).toBe(EN.d.simple.randomizeHelp)
    expect(help?.closest('.fw-khd')).not.toBeNull()
    for (const why of screen.container.querySelectorAll('.fw-k .why')) {
      expect(why.textContent).not.toContain(EN.d.simple.randomizeHelp)
    }
  })

  // Ruling 9: cell, voids and top are advanced-only.
  it('shows the preview fields the old simple view shows, and only those', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByLabelText('stroke width (grid units)')).toBeVisible()
    await expect.element(screen.getByRole('switch', { name: /round the corners/ })).toBeVisible()
    await expect.element(screen.getByRole('switch', { name: /highlight the longest/ })).toBeVisible()
    expect(screen.container.querySelector('#view-cell')).toBeNull()
    expect(screen.container.querySelector('#view-top')).toBeNull()
    expect(screen.getByRole('switch', { name: /show jammed cells/ }).query()).toBeNull()
  })

  // The third owner of the shared field (Ruling 2). No case here committed a view
  // field before, which is why `tsc` was the only thing between this panel and a
  // field that opens empty and throws `onCommit is not a function` on blur.
  it('a view field in the simple panel still writes the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
    await userEvent.fill(stroke, '0.8')
    await userEvent.tab()
    expect(useStore.getState().view.stroke).toBe(0.8)
  })

  // Spec §6: "the simple view gets the picker and not the custom editor."
  it('offers the theme picker, and writes a choice into the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const picker = screen.getByRole('combobox')
    await expect.element(picker).toBeInTheDocument()
    await userEvent.selectOptions(picker, 'gruvbox-dark')
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  })

  // Task 1 of the palette round-2 addendum: the twelve names with a swatch
  // strip beside the picker, showing the *chosen* theme's arrow colours.
  it('shows the chosen theme’s arrow colours, in order, on its own paper, and clears with the theme', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.container.querySelector('.fw-swatches')).toBeNull()
    const picker = screen.getByRole('combobox')
    await userEvent.selectOptions(picker, 'gruvbox-dark')
    const strip = screen.container.querySelector<HTMLElement>('.fw-swatches')
    if (!strip) throw new Error('no swatch strip after choosing a theme')
    const theme = themeFixture('gruvbox-dark')
    expect(getComputedStyle(strip).backgroundColor).toBe(rgbOf(theme.paper))
    const swatches = [...strip.querySelectorAll<HTMLElement>('.fw-swatch')]
    expect(swatches.map((s) => getComputedStyle(s).backgroundColor)).toEqual(theme.palette.map(rgbOf))
    // Finding 4 (final whole-addendum review): this file loads no stylesheet,
    // so the computed-style reads above read React's inline `backgroundColor`
    // and would pass with no CSS at all. `.fw-k .fw-swatch` (console.css)
    // needs a `.fw-k` ancestor to apply; this pins the DOM shape it depends on.
    expect(strip.closest('.fw-k')).not.toBeNull()
    // Finding 9 (final whole-addendum review): pin the strip's `aria-hidden`,
    // which was load-bearing and unasserted before this.
    expect(strip.getAttribute('aria-hidden')).toBe('true')
    await userEvent.selectOptions(picker, '')
    expect(screen.container.querySelector('.fw-swatches')).toBeNull()
  })

  // Spec §6: "the simple view gets the picker and not the custom editor."
  // Pinned by absence, not merely by not calling it: sharing `ViewPanel.tsx`'s
  // exports between the two panels (as `ThemeSwatchStrip` already is) is
  // exactly how a future edit could hand the simple view the editor by accident.
  it('has no custom-palette editor — no add-colour button and no colour input', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.getByRole('button', { name: 'add colour' }).query()).toBeNull()
    expect(screen.container.querySelector('input[type="color"]')).toBeNull()
    // The palette is the console's preview row (handoff 2, PR 3), never here.
    expect(screen.container.querySelector('#view-palette-label')).toBeNull()
  })

  // Spec R7: the help paragraph left the card for the preview heading's list.
  it('head height points at its help under the preview heading', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.container.querySelector('#view-headHeight')?.getAttribute('aria-describedby')).toBe(
      'view-headHeight-help',
    )
    const help = document.getElementById('view-headHeight-help')
    expect(help?.textContent).toBe(EN.t('headHelp'))
    expect(help?.closest('.fw-khd')).not.toBeNull()
  })

  // The descriptions switch is gone (handoff 2, PR 2): the simple view's list
  // is always in sight, and the field still names it.
  it('the preview help is named by its field, with no switch to hide it', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const list = screen.container.querySelector('.fw-khd .fw-kdesc')
    expect(list?.classList.contains('fw-vh')).toBe(false)
    const described = screen.container.querySelector('#view-headHeight')?.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(described)).not.toBeNull()
  })

  it('with help on the preview help is in sight', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.container.querySelector('.fw-khd .fw-kdesc')?.classList.contains('fw-vh')).toBe(false)
  })
})
