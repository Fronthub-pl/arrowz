import { PARAM_SPEC } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { act } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { PresetStrip } from './PresetStrip'
// The last case measures where the marker lands, which needs the real cascade:
// the tokens, `.fw`'s font and grid, and the strip's own rules, in the order
// `main.tsx` loads them. `console.css` is not among them — nothing in this
// file renders a console.
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

describe('PresetStrip', () => {
  it('offers every preset the engine has, and no others', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    expect(screen.getByRole('button').elements()).toHaveLength(OPTIONS.length)
  })

  // Ruling 8: four chips read `square`, so the name a screen reader hears
  // carries the level and the size the visible label drops. The regex pins the
  // format of one name; the set is the property the visible label breaks —
  // twenty-six chips, twenty-six names, no two of them the same.
  it('names each chip in full for a screen reader', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await expect.element(screen.getByRole('button', { name: /Easy.*25×50.*tunnels/ })).toBeInTheDocument()
    const names = screen
      .getByRole('button')
      .elements()
      .map((chip) => chip.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(OPTIONS.length)
  })

  // A preset is a full configuration, not a patch (`lab-presets.ts`'s head
  // comment), so an unrelated knob left over from the last experiment goes.
  it('writes every knob, not only the ones the preset names', async () => {
    useStore.getState().params.set('warns', 3)
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    const spec = PARAM_SPEC.find((s) => s.key === 'warns')
    if (spec === undefined) throw new Error('PARAM_SPEC has no warns')
    expect(useStore.getState().params.values.warns).toBe(spec.def)
  })

  // §2.2 row 2: "all knobs set from the preset, `cell` from `exportCell`".
  //
  // Hard 75×150 and not a smaller board: `exportCell` saturates at 18, which
  // every board up to 91 cells on its longer side reaches, so a preset from
  // the top of the table would be satisfied by the 18 another case has
  // already left behind — and by the wrong size as readily as the right one.
  // 75×150 gives 11, which is neither 18 nor the slice's own starting 12.
  it('sets the export cell size the preset implies', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Hard.*portrait/ }).click()
    expect(useStore.getState().view.cell).toBe(exportCell(75, 150))
  })

  it('runs at once, and through the machine path', async () => {
    const g = stub()
    const before = useStore.getState().params.edits
    const screen = await render(<PresetStrip control={g.control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(g.started()).toBe(1)
    expect(useStore.getState().params.edits).toBe(before)
  })

  // `aria-current`, not `aria-pressed`: this is the current item of a set, not
  // twenty-six toggle buttons of which one never un-presses.
  it('marks the preset the knobs currently spell', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    expect(findPreset(useStore.getState().params.values)?.id).toBe('easy-square')
    await expect.element(screen.getByRole('button', { name: /Easy.*square/ })).toHaveAttribute('aria-current', 'true')
  })

  // Ruling 10: `findPreset` compares only the preset's own keys, so `seed`
  // cannot break the match and `W` can. The strip itself no longer says so
  // (spec R5, review P4): the top bar carries the word now, in the slot the
  // preset's name leaves.
  it('drops the preset\'s current mark, but says nothing itself, when a knob the preset names has moved', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    useStore.getState().params.set('W', 26)
    await expect.element(screen.getByRole('button', { name: /Easy.*square/ })).not.toHaveAttribute('aria-current')
    expect(screen.container.textContent).not.toContain('edited')
  })

  // `act`, as `useAutoRun.browser.test.tsx` wraps its own store writes: a write
  // from outside a React event reaches the DOM on a microtask at the earliest,
  // and a synchronous read after it would see the render before it — in which
  // the marker is equally absent, whatever `findPreset` makes of the seed.
  it('does not say so for a knob no preset names', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await screen.getByRole('button', { name: /Easy.*square/ }).click()
    await act(async () => useStore.getState().params.set('seed', 12))
    expect(screen.container.textContent).not.toContain('edited')
  })
})
