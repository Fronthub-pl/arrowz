import { PARAM_SPEC } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { act } from 'react'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import { mountApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { PresetStrip } from './PresetStrip'
// The closed panel is hidden by `.fw-pp-panel[hidden]` (its own `display: grid`
// beats the user agent's `[hidden]`), so visibility needs the real cascade.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

const OPTIONS = PRESETS.flatMap((level) => level.options)

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.ui.raiseClamped(false)
})

/** Opens the panel the way a person does. */
async function open(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole('button', { name: /^preset/ }).click()
  await expect.element(screen.getByRole('group', { name: 'Presets' })).toBeVisible()
}

describe('PresetStrip', () => {
  it('names the preset the knobs spell on its trigger, with its size', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    // The store's defaults are 25×50, which `easy-portrait` spells exactly.
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveTextContent('presetEasy tall25×50▼')
    expect(screen.container.querySelector('.fw-pp-edited')).toBeNull()
  })

  it('says custom settings, and edited beside it, when no preset spells the knobs', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveTextContent('presetcustom settings▼')
    await expect.element(screen.getByText('edited since the last preset')).toBeVisible()
  })

  it('is closed at first, and says so', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    await expect.element(screen.getByRole('group', { name: 'Presets' })).not.toBeInTheDocument()
    const panel = screen.container.querySelector('.fw-pp-panel')
    const id = screen
      .getByRole('button', { name: /^preset/ })
      .element()
      .getAttribute('aria-controls')
    expect(panel?.id).toBe(id)
  })

  it('offers every preset the engine has, and no others, in one column per level', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    const rows = screen.container.querySelectorAll('.fw-pp-panel button')
    expect(rows).toHaveLength(OPTIONS.length)
    expect(screen.container.querySelectorAll('.fw-pp-col')).toHaveLength(PRESETS.length)
    await expect.element(screen.getByRole('group', { name: 'Easy', exact: true })).toBeVisible()
  })

  // Four rows read `square`, so the accessible name carries the level too, the
  // same name the strip's chips had. A row's two spans sit on its vertical
  // middle, not on the baseline; inside `.fw`, which the row's rules target.
  it('centres a row’s mode and size on the row, not on its top edge', async () => {
    const screen = await render(
      <div className="fw">
        <PresetStrip control={stub().control} />
      </div>,
    )
    await screen.getByRole('button', { name: /^preset/ }).click()
    const rows = [...screen.container.querySelectorAll<HTMLElement>('.fw-pp-col button')]
    expect(rows.length).toBeGreaterThan(20)
    const middle = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2
    }
    for (const row of rows) {
      for (const span of row.querySelectorAll(':scope > span')) {
        expect(Math.abs(middle(span) - middle(row)), row.getAttribute('aria-label') ?? '').toBeLessThan(1)
        // With `line-height: 1` each span's box is its font size tall, so the
        // boxes' shared middle is where the glyphs sit too.
        expect(span.getBoundingClientRect().height).toBeCloseTo(Number.parseFloat(getComputedStyle(span).fontSize), 0)
      }
    }
  })

  it('names each row in full, twenty-six names and no two the same', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await expect.element(screen.getByRole('button', { name: /Easy.*25×50.*tunnels/ })).toBeVisible()
    const names = [...screen.container.querySelectorAll('.fw-pp-panel button')].map((b) => b.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(OPTIONS.length)
    const row = screen.getByRole('button', { name: /Easy.*25×50.*tunnels/ }).element()
    expect(row.textContent).toBe('tunnels25×50')
  })

  it('writes every knob, not only the ones the preset names', async () => {
    useStore.getState().params.set('warns', 3)
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    const spec = PARAM_SPEC.find((s) => s.key === 'warns')
    if (spec === undefined) throw new Error('PARAM_SPEC has no warns')
    expect(useStore.getState().params.values.warns).toBe(spec.def)
  })

  // Hard 75×150: `exportCell` saturates at 18 up to 91 cells on the longer
  // side, so a small preset would pass on a stale 18. 75×150 gives 11.
  it('sets the export cell size the preset implies', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Hard.*tall/ }).click()
    expect(useStore.getState().view.cell).toBe(exportCell(75, 150))
  })

  it('runs at once, through the machine path, and closes with the focus back on the trigger', async () => {
    const g = stub()
    const before = useStore.getState().params.edits
    const screen = await render(<PresetStrip control={g.control} />)
    await open(screen)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(g.started()).toBe(1)
    expect(useStore.getState().params.edits).toBe(before)
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^preset/ }).element())
  })

  // Anchored: once Easy square is current, the trigger's own name
  // (`preset Easy square 25×25`) matches an unanchored /Easy.*square/ too.
  it('marks the preset the knobs currently spell, and drops the mark when a knob it names moves', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await screen.getByRole('button', { name: /^Easy.*square/ }).click()
    expect(findPreset(useStore.getState().params.values)?.id).toBe('easy-square')
    await open(screen)
    await expect.element(screen.getByRole('button', { name: /^Easy.*square/ })).toHaveAttribute('aria-current', 'true')
    await act(async () => useStore.getState().params.set('W', 26))
    await expect.element(screen.getByRole('button', { name: /^Easy.*square/ })).not.toHaveAttribute('aria-current')
  })

  // `findPreset` compares only the preset's own keys, so `seed` cannot break the match.
  it('does not call a seed change an edit', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('seed', 12))
    expect(screen.container.querySelector('.fw-pp-edited')).toBeNull()
  })

  it('opens on the current preset, or on the first row when there is none', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toMatch(/Easy.*25×50.*tall/)
    await userEvent.keyboard('{Escape}')
    await act(async () => useStore.getState().params.set('W', 26))
    await open(screen)
    await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toMatch(/Easy.*25×25.*square/)
  })

  it('moves by arrows within and across levels, and Home and End go to the ends of a level', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('W', 26))
    await open(screen)
    const at = () => document.activeElement?.getAttribute('aria-label') ?? ''
    await userEvent.keyboard('{ArrowDown}')
    expect(at()).toMatch(/^Easy.*tall/)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(at()).toMatch(/^Easy.*square/)
    await userEvent.keyboard('{End}')
    expect(at()).toMatch(/^Easy.*skeleton/)
    await userEvent.keyboard('{ArrowRight}')
    expect(at()).toMatch(/^Medium.*skeleton/)
    await userEvent.keyboard('{Home}{ArrowLeft}')
    expect(at()).toMatch(/^Easy.*square/)
    await userEvent.keyboard('{ArrowLeft}')
    expect(at()).toMatch(/^Easy.*square/)
    // Into a shorter column: Extreme's last row is row 3, Huge has three
    // rows, so ArrowRight clamps to its row 2, the winding skeleton.
    await userEvent.keyboard('{End}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(at()).toMatch(/^Extreme.*skeleton/)
    await userEvent.keyboard('{ArrowRight}')
    expect(at()).toBe('Huge 400×400 winding skeleton')
    await userEvent.keyboard('{ArrowDown}')
    expect(at()).toBe('Huge 400×400 winding skeleton')
    await userEvent.keyboard('{ArrowRight}')
    expect(at()).toMatch(/^Insane.*skeleton/)
    await userEvent.keyboard('{ArrowRight}')
    expect(at()).toMatch(/^Insane.*skeleton/)
  })

  it('closes on Escape with the focus back on the trigger, and on a press outside without taking the focus', async () => {
    // `elsewhere` sits above the row: below it, the open panel covers it,
    // and a press there would land on the panel, not outside it.
    const screen = await render(
      <>
        <button type="button">elsewhere</button>
        <PresetStrip control={stub().control} />
      </>,
    )
    await open(screen)
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^preset/ }).element())
    await open(screen)
    await screen.getByRole('button', { name: 'elsewhere' }).click()
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'elsewhere' }).element())
  })

  // A press on a button or on plain text moves the focus on mousedown, which
  // would hide a focus steal by the closing panel. A drag surface keeps the
  // focus where it is on mousedown, so a steal would stick there; hence this one.
  it('does not take the focus on a press outside that moves no focus itself', async () => {
    const screen = await render(
      <>
        <p>nothing to focus</p>
        <PresetStrip control={stub().control} />
      </>,
    )
    const surface = screen.getByText('nothing to focus').element()
    surface.addEventListener('mousedown', (event) => event.preventDefault())
    await open(screen)
    await screen.getByText('nothing to focus').click()
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /^preset/ }).element())
  })

  it('closes when the focus tabs out of the strip', async () => {
    const screen = await render(
      <>
        <PresetStrip control={stub().control} />
        <button type="button">after</button>
      </>,
    )
    await open(screen)
    const strip = screen.container.querySelector('.fw-presets')
    for (let i = 0; i < 40 && (strip?.contains(document.activeElement) ?? false); i++) await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'after' }).element())
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveAttribute('aria-expanded', 'false')
  })

  // A knob entry discards its draft on Escape; the picker taking that Escape
  // would blur the entry and commit the draft instead. Focus move and key in
  // one task, so the picker's listener is still installed when the key lands.
  it('leaves alone an Escape pressed outside the strip', async () => {
    const screen = await render(
      <>
        <PresetStrip control={stub().control} />
        <input aria-label="entry" />
      </>,
    )
    await open(screen)
    const entry = screen.getByRole('textbox', { name: 'entry' }).element()
    if (!(entry instanceof HTMLInputElement)) throw new Error('no entry')
    entry.focus()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    entry.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(entry)
  })

  // The drawer's Escape must not also fire.
  it('consumes the Escape it closes on', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    let prevented: boolean | null = null
    const seen = (event: KeyboardEvent) => {
      prevented = event.defaultPrevented
    }
    document.addEventListener('keydown', seen)
    try {
      await userEvent.keyboard('{Escape}')
    } finally {
      document.removeEventListener('keydown', seen)
    }
    expect(prevented).toBe(true)
  })

  it('says above the columns that a level sets the size only, and describes each mode', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    const panel = screen.getByRole('group', { name: 'Presets' }).element()
    const caption = panel.querySelector('.fw-pp-cap')
    expect(caption?.textContent).toBe("Levels set the board's size only; the options change how arrows are laid.")
    expect(panel.getAttribute('aria-describedby')).toBe(caption?.id)
    const tunnels = screen.getByRole('button', { name: 'Hard 75×150 tunnels' }).element()
    const id = tunnels.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(id)?.textContent).toBe('Arrows start deep inside, buried behind others: harder.')
    expect(tunnels.getAttribute('title')).toBe('Arrows start deep inside, buried behind others: harder.')
  })

  // The panel is a grid: a caption that took one cell would push the Easy
  // column to the second track, and hidden descriptions must take none.
  it.each([1440, 1200])('keeps one column per level beside the caption at %d px', async (width) => {
    await page.viewport(width, 900)
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    const panel = screen.container.querySelector('.fw-pp-panel')
    const caption = panel?.querySelector('.fw-pp-cap')
    const cols = [...(panel?.querySelectorAll('.fw-pp-col') ?? [])]
    expect(cols).toHaveLength(PRESETS.length)
    const capBox = caption?.getBoundingClientRect()
    const panelBox = panel?.getBoundingClientRect()
    expect(capBox && panelBox && capBox.width).toBeGreaterThan((panelBox?.width ?? 0) - 4)
    const first = cols[0]?.getBoundingClientRect()
    expect(first && panelBox && Math.abs(first.left - panelBox.left)).toBeLessThan(3)
  })
})

const strips = () => document.querySelectorAll('.fw-presets')

// One strip: in the top bar of a low window, in the lab otherwise.
test.each([
  [924, 540, 'advanced', '.fw-top'],
  [924, 900, 'advanced', '.fw-lab'],
  [600, 500, 'advanced', '.fw-lab'],
] as const)('at %d×%d in the %s view the strip stands in %s', async (w, h, mode, parent) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  await page.viewport(w, h)
  await mountApp(mode)
  expect(strips()).toHaveLength(1)
  expect(strips()[0]?.parentElement?.closest('.fw-top, .fw-lab')?.matches(parent)).toBe(true)
  expect(document.querySelector('.fw-lab')?.classList.contains('presets-top')).toBe(parent === '.fw-top')
  vi.restoreAllMocks()
})

test('the simple view has no strip in the top bar of a low window', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  await page.viewport(924, 540)
  await mountApp('simple')
  expect(strips()).toHaveLength(0)
  expect(document.querySelector('.fw-lab')?.classList.contains('presets-top')).toBe(false)
  vi.restoreAllMocks()
})

test('opening the panel focuses its row without scrolling anything', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  await page.viewport(924, 540)
  const screen = await mountApp('advanced')
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await screen.getByRole('button', { name: /^preset/ }).click()
  await expect.poll(() => focus.mock.calls.length).toBeGreaterThan(0)
  expect(focus.mock.calls[0]?.[0]).toEqual({ preventScroll: true })
  vi.restoreAllMocks()
})
