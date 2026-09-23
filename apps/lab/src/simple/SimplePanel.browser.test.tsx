import { DEFAULT_VIEW, themeOf } from '@arrowz/board-element'
import { dictionary } from '@arrowz/engine/i18n'
import { simpleParams } from '@arrowz/engine/simple'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SimplePanel } from './SimplePanel'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'

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
const DEFAULT_ROUNDED = DEFAULT_VIEW.rounded

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
  useStore.setState((s) => ({ view: { ...s.view, theme: '', palette: [], rounded: DEFAULT_ROUNDED } }))
  state().lang.setLang('en')
})

describe('SimplePanel', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  })

  // Round 3 (3c): the simple view is the advanced view's grid — two sections
  // of knob rows, fourteen rows in all, and no card left over.
  it('is two named sections of knob rows on the advanced view’s grid', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const grid = screen.container.querySelector('.fw-simple > .kv.kv-g')
    expect(grid).not.toBeNull()
    await expect.element(screen.getByRole('group', { name: 'board' })).toBeVisible()
    await expect.element(screen.getByRole('group', { name: 'Preview' })).toBeVisible()
    expect(grid?.querySelectorAll('.kv-row')).toHaveLength(14)
    expect(screen.container.querySelector('.fw-k, .fw-grid, .fw-kdesc')).toBeNull()
    await act(async () => state().lang.setLang('pl'))
    await expect.element(screen.getByRole('group', { name: 'plansza' })).toBeVisible()
    await expect.element(screen.getByRole('group', { name: 'Podgląd' })).toBeVisible()
    await act(async () => state().lang.setLang('en'))
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

  // The track of a size row writes the recipe too, not the knob alone: a
  // width dragged to 60 is the recipe's 60, and the knobs are what it gives.
  it('writes a dragged height into the recipe, and shows the recipe’s value', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const shaped = state().recipe.edits
    slide(screen.container.querySelector<HTMLInputElement>('#knob-H'), 60)
    await expect.poll(() => state().recipe.value.H).toBe(60)
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    await expect.element(screen.getByRole('button', { name: 'height: 60' })).toBeVisible()
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

  // A recipe slider has nothing to type: its value is text, it has no `?`
  // and no numeric ends, and its two end words are its description.
  it('shows a recipe slider’s value as text, with its end words as its description', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const input = screen.container.querySelector<HTMLInputElement>('#simple-shape')
    const row = input?.closest('.kv-row')
    if (!input || !(row instanceof HTMLElement)) throw new Error('no shape row')
    expect(row.querySelector('.vc button, .q, .kv-end')).toBeNull()
    expect(row.querySelector('.vc')?.textContent).toBe(String(Math.round(state().recipe.value.shape * 100)))
    const ends = document.getElementById(input.getAttribute('aria-describedby') ?? '')
    expect(ends?.className).toBe('kv-ends')
    expect([...(ends?.children ?? [])].map((word) => word.textContent)).toEqual([...EN.d.simple.ends.shape])
    expect(row.contains(ends)).toBe(true)
  })

  // HANDOFF-3, known differences: the end words stand under the track, not
  // across the whole row as the reconstruction has them.
  it.each([
    [1440, 900],
    [375, 812],
  ])('puts a recipe slider’s end words under its track, one at each end, at %i px', async (w, h) => {
    await page.viewport(w, h)
    const screen = await render(
      <div style={{ width: `${Math.min(w, 720)}px`, containerType: 'inline-size' }}>
        <SimplePanel control={stub().control} />
      </div>,
    )
    const track = screen.container.querySelector('#simple-lengths')?.closest('.kv-track')
    const ends = screen.container.querySelector('#simple-lengths-ends')
    if (!(track instanceof HTMLElement) || !(ends instanceof HTMLElement)) throw new Error('no lengths row')
    const [low, high] = [...ends.children].map((word) => word.getBoundingClientRect())
    const lane = track.getBoundingClientRect()
    expect(Math.abs((low?.left ?? 0) - lane.left)).toBeLessThanOrEqual(1)
    expect(Math.abs((high?.right ?? 0) - lane.right)).toBeLessThanOrEqual(1)
    expect(low?.top ?? 0).toBeGreaterThanOrEqual(lane.bottom - 1)
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

  // The skeleton's segmented button takes the control's track, to its right edge.
  it('stands the skeleton’s choice at the right edge of the row', async () => {
    const screen = await render(
      <div style={{ width: '720px', containerType: 'inline-size' }}>
        <SimplePanel control={stub().control} />
      </div>,
    )
    const seg = screen.container.querySelector('.fw-simple .kv-row .fw-seg')
    const cc = seg?.closest('.cc')
    if (!(seg instanceof HTMLElement) || !(cc instanceof HTMLElement)) throw new Error('no skeleton choice')
    expect(cc.classList.contains('wide')).toBe(true)
    expect(Math.abs(seg.getBoundingClientRect().right - cc.getBoundingClientRect().right)).toBeLessThanOrEqual(1)
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

  it('switches randomising without running, and says on or off', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const random = screen.getByRole('switch', { name: 'randomise' })
    const row = random.element().closest('.kv-row')
    expect(row?.querySelector('.vc')?.textContent).toBe('off')
    await random.click()
    expect(state().recipe.value.random).toBe(true)
    expect(row?.querySelector('.vc')?.textContent).toBe('on')
    expect(g.started()).toBe(0)
  })

  // Round 3: the short label names the switch, the whole sentence is its
  // title, and its `?` opens the help it is described by — in its own row.
  it('keeps the randomise sentence in the title and its help under the row’s ?', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const random = screen.getByRole('switch', { name: 'randomise' })
    expect(random.element().getAttribute('title')).toBe(EN.d.simple.randomize)
    const help = document.getElementById(random.element().getAttribute('aria-describedby') ?? '')
    expect(help?.textContent).toBe(EN.d.simple.randomizeHelp)
    const row = random.element().closest('.kv-row')
    expect(row?.contains(help)).toBe(true)
    const q = row?.querySelector('button.q')
    expect(q?.getAttribute('aria-controls')).toBe(help?.id)
    await act(async () => state().lang.setLang('pl'))
    await expect.element(screen.getByRole('switch', { name: 'losuj' })).toBeVisible()
    await act(async () => state().lang.setLang('en'))
  })

  // Ruling 9: cell, voids and top are advanced-only.
  it('shows the preview rows the old simple view shows, and only those', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    for (const id of ['view-stroke', 'view-headWidth', 'view-headHeight', 'view-theme'])
      expect(screen.container.querySelector(`#${id}`), id).not.toBeNull()
    for (const name of ['rounded', 'multicolour', 'longest'])
      await expect.element(screen.getByRole('switch', { name })).toBeVisible()
    expect(screen.container.querySelector('#view-cell')).toBeNull()
    expect(screen.container.querySelector('#view-top')).toBeNull()
    expect(screen.container.querySelector('#view-voids')).toBeNull()
  })

  // The same rows as the preview tab, writing the same slice.
  it('a preview row in the simple panel still writes the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    slide(screen.container.querySelector<HTMLInputElement>('#view-stroke'), 0.8)
    await expect.poll(() => useStore.getState().view.stroke).toBe(0.8)
    await screen.getByRole('switch', { name: 'rounded' }).click()
    expect(useStore.getState().view.rounded).toBe(!DEFAULT_ROUNDED)
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
    // The theme's own row now (round 3), as on the preview tab.
    expect(strip.closest('.kv-row')?.querySelector('#view-theme')).not.toBeNull()
    // Finding 9 (final whole-addendum review): pin the strip's `aria-hidden`,
    // which was load-bearing and unasserted before this.
    expect(strip.getAttribute('aria-hidden')).toBe('true')
    await userEvent.selectOptions(picker, '')
    expect(screen.container.querySelector('.fw-swatches')).toBeNull()
  })

  // Spec §6: "the simple view gets the picker and not the custom editor."
  // Pinned by absence, not merely by not calling it: sharing `ViewPanel.tsx`'s
  // exports between the two panels (as `ThemeRow` now is) is exactly how a
  // future edit could hand the simple view the editor by accident.
  it('has no custom-palette editor — no add-colour button and no colour input', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.getByRole('button', { name: 'add colour' }).query()).toBeNull()
    expect(screen.container.querySelector('input[type="color"]')).toBeNull()
    // The palette is the console's preview row (handoff 2, PR 3), never here.
    expect(screen.container.querySelector('#view-palette-label')).toBeNull()
  })

  // Round 3: no help list over the panel; every row's help is under its own ?.
  it('head height points at its help in its own row, which its ? opens', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const track = screen.container.querySelector('#view-headHeight')
    expect(track?.getAttribute('aria-describedby')).toBe('view-headHeight-help')
    const help = document.getElementById('view-headHeight-help')
    expect(help?.textContent).toBe(EN.t('headHelp'))
    expect(help?.closest('.kv-row')).toBe(track?.closest('.kv-row'))
    expect(help?.classList.contains('fw-vh')).toBe(true)
    await screen.getByRole('button', { name: EN.t('aboutKnob', 'head height') }).click()
    expect(help?.classList.contains('fw-vh')).toBe(false)
  })
})
