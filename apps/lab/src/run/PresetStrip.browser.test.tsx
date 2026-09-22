import { PARAM_SPEC } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { act } from 'react'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { PresetStrip } from './PresetStrip'
// The closed panel is hidden by `.fw-pp-panel[hidden]` in `run.css` (its own
// `display: grid` beats the user agent's `[hidden]`), so every visibility
// assertion here needs the real cascade, in the order `main.tsx` loads it.
// `console.css` is not among them: nothing in this file renders a console.
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
    await expect.element(screen.getByRole('button', { name: /^preset/ })).toHaveTextContent('presetEasy portrait25×50▼')
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

  // A row's visible text is the mode and the size; four rows read `square`,
  // so the accessible name carries the level too — the same name the strip's
  // chips had, so every case that chooses a preset by name still finds it.
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
    await screen.getByRole('button', { name: /Hard.*portrait/ }).click()
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

  // Ruling 10: `findPreset` compares only the preset's own keys, so `seed`
  // cannot break the match.
  it('does not call a seed change an edit', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await act(async () => useStore.getState().params.set('seed', 12))
    expect(screen.container.querySelector('.fw-pp-edited')).toBeNull()
  })

  it('opens on the current preset, or on the first row when there is none', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    await expect.poll(() => document.activeElement?.getAttribute('aria-label')).toMatch(/Easy.*25×50.*portrait/)
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
    expect(at()).toMatch(/^Easy.*portrait/)
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

  // Spec §3.2: the drawer's Escape (Task 8) must not also fire.
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
})
