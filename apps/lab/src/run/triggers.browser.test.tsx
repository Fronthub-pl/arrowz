import { defaultParams, type Params } from '@arrowz/engine'
import { PRESETS } from '@arrowz/engine/presets'
import { exportCell } from '@arrowz/engine/simple'
import { act } from 'react'
import { BrowserRouter } from 'react-router'
import { render, renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { useStore } from '../state/store'
import { encodeHash } from '../state/url'
import { VIEW } from '../state/url.fixtures'
import { useUrlHash } from '../state/useUrlHash'
import { PresetStrip } from './PresetStrip'
import { RunColumn } from './RunColumn'
import { AUTO_DELAY_MS, useAutoRun } from './useAutoRun'
import type { RunControl } from './useRun'

/**
 * Spec §2.2's table, stated as cases: one per row this PR owns. Every trigger
 * it names is already built — Tasks 1 to 13 — so this file is a statement of
 * the contract rather than a discovery about it.
 *
 * Each case asserts the two things the table states, and the second half is
 * the one worth the file. **When** the run starts is only half a contract;
 * three of these triggers rewrite the knobs on their way to `start()`, and a
 * run that fired before the rewrite would carve a board nobody asked for —
 * the preset's chip with the previous size, New seed with the old seed,
 * Defaults with the knobs it was pressed to escape. So the recorder snapshots
 * the knobs *at the call*, and the cases read that snapshot rather than the
 * store afterwards, where the two orders are indistinguishable.
 *
 * Seven rows are here. Three are not, and are PR 4's, because the view they
 * belong to does not exist under `apps/lab` yet: the simple size field, the
 * simple slider and the simple segmented button. PR 4 also owns the missing
 * half of four rows that *are* here:
 *
 * - page load — the old lab applies the simple recipe before running when
 *   that view is active and the link carried no knobs (`applySimple()`, which
 *   lives in `packages/cli/lab-page.ts:1480` and has no counterpart in this
 *   application);
 * - Generate, New seed and Defaults — in simple view with randomising on,
 *   `lab-page.ts:915` and `:920` redraw the knobs from the recipe first, so
 *   case 4's "rewrites nothing" and case 5's "moves the seed and nothing
 *   else" are true of the advanced view alone, and case 6's `defaultParams()`
 *   becomes "the defaults, with the recipe reset and `random` kept".
 *
 * The control is a stub everywhere but case 8: what a trigger does to the
 * worker is `useGenerator.browser.test.tsx`'s subject, and what it does to the
 * knobs is this one's.
 */
function recorder() {
  const seen: Params[] = []
  const control: RunControl = {
    start: () => void seen.push({ ...useStore.getState().params.values }),
    abort: () => {},
    hold: () => {},
  }
  return { control, seen }
}

/** Case 7's host: `useUrlHash` calls `useLocation()`, so it needs a router. */
function HashHost({ control }: { control: RunControl }) {
  useUrlHash(control)
  return null
}

beforeEach(() => {
  // The fragment first: `useUrlHash` reads it at mount, and a link one case
  // left in the bar would be read by the next one as a pasted one — which
  // case 8 would then carve.
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.setAuto(false)
  state.ui.setHelp(true)
  state.ui.raiseClamped(false)
  state.ui.setMode('advanced')
  state.recipe.reset()
  state.recipe.setRandom(false)
})
afterEach(() => {
  vi.useRealTimers()
  history.replaceState(null, '', location.pathname)
})

describe('what starts a run (spec §2.2)', () => {
  // Row 1. Fake timers go on *after* the render and without
  // `shouldAdvanceTime`, every store write is inside `act`, and the
  // assertions are plain `expect`: `expect.element` polls, and a poll against
  // a frozen clock hangs rather than fails.
  it('1 · a knob edit with auto on: once, 350 ms later, with the value typed', async () => {
    const r = recorder()
    await renderHook(() => useAutoRun(r.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(r.seen).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.seen).toHaveLength(1)
    // The edit is the run's, not a value the debounce read from somewhere
    // older: 31 is not the default 25.
    expect(r.seen[0]?.W).toBe(31)
  })

  // Row 1's other half, which the table states as a condition rather than a
  // row of its own: the switch is what makes the debounce exist at all.
  it('2 · a knob edit with auto off: never', async () => {
    const r = recorder()
    await renderHook(() => useAutoRun(r.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 32))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(r.seen).toHaveLength(0)
  })

  // Row 2. Hard portrait and not a preset from the top of the table:
  // `exportCell` saturates at 18 for every board up to 91 cells on its longer
  // side, so a small preset would be satisfied by a stale 18 as readily as by
  // the right answer. 75×150 gives 11, which is neither 18 nor the view
  // slice's own starting 12.
  it('3 · a preset: at once, with every knob and the export cell rewritten first', async () => {
    const r = recorder()
    const option = PRESETS.flatMap((level) => level.options).find((o) => o.id === 'hard-portrait')
    if (option === undefined) throw new Error('PRESETS has no hard-portrait')
    const screen = await render(<PresetStrip control={r.control} />)
    await screen.getByRole('button', { name: /Hard.*portrait/ }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.W).toBe(option.params.W)
    expect(r.seen[0]?.H).toBe(option.params.H)
    expect(useStore.getState().view.cell).toBe(exportCell(75, 150))
  })

  // Row 6, advanced view. `before` is a size no default carries, so "every
  // knob equal to what it was" is a claim about the console's own state and
  // not about `defaultParams()` — which case 6 would satisfy too.
  it('4 · Generate: at once, rewriting nothing', async () => {
    const r = recorder()
    useStore.getState().params.setMany({ W: 33, H: 66, seed: 7 })
    const before = { ...useStore.getState().params.values }
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]).toEqual(before)
  })

  // Row 7, advanced view. The second assertion is the order: with `start()`
  // called before `setMany`, the snapshot would still read 1 while the store
  // read the new seed, and only a test that looks at the snapshot can tell.
  it('5 · New seed: at once, after the seed has moved', async () => {
    const r = recorder()
    useStore.getState().params.setMany({ seed: 1 })
    const before = { ...useStore.getState().params.values }
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.seed).not.toBe(1)
    expect(r.seen[0]?.seed).toBe(useStore.getState().params.values.seed)
    // The draw touches the seed and nothing else.
    expect({ ...r.seen[0], seed: 1 }).toEqual(before)
  })

  // Row 8, advanced view. Three knobs are moved first, one of them into a
  // broken rule, because Defaults is the way out of one: a Defaults that ran
  // before resetting would be refused by `useRun` on the real control.
  it('6 · Defaults: at once, on defaultParams()', async () => {
    const r = recorder()
    useStore.getState().params.setMany({ W: 77, seed: 5, wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]).toEqual(defaultParams())
  })

  // Row 9. An external `hashchange` — a link pasted into the bar — and not the
  // page describing itself. There is no record of what the hook wrote: the
  // listener re-encodes the store and returns when the fragment already says
  // that (`useUrlHash.ts:134-136`), so a fragment matching what is on screen is
  // never a trigger, whoever put it there. `useUrlHash.browser.test.tsx`
  // exercises that comparison from the other side.
  it('7 · an external hashchange: at once, on the knobs the link named', async () => {
    const r = recorder()
    await render(
      <BrowserRouter>
        <HashHost control={r.control} />
      </BrowserRouter>,
    )
    location.hash = encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }).slice(1)
    await vi.waitFor(() => expect(r.seen).toHaveLength(1))
    // 61 and not the default 25: the link is applied before the run, not after
    // it. The assertion is on the snapshot for that reason — the store holds
    // 61 under either order.
    expect(r.seen[0]?.W).toBe(61)
  })

  // Row 10. The one case with the real control, because "a run started" is
  // here a claim about `App` and the hooks it mounts, and a stub would only
  // restate that the effect calls the prop it was given.
  //
  // `run.params` and not `run.phase === 'running'`: the 25×50 board finishes
  // in milliseconds, so a phase read is a race the carve can win. `params` is
  // set by `started()` and survives `finished()`, so it answers whichever side
  // of the carve the poll lands on.
  it('8 · page load: a run without a click, on the knobs the page opened with', async () => {
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    // No hash was pasted, so the knobs the load run used are the page's own.
    // The `applySimple()` half of this row is PR 4's, as the head comment says.
    expect(useStore.getState().run.params).toEqual(defaultParams())
  }, 40_000)
})
