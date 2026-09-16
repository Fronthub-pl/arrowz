import { defaultParams, type Params } from '@arrowz/engine'
import { PRESETS } from '@arrowz/engine/presets'
import { defaultChoice, exportCell, recipeOf, simpleParams } from '@arrowz/engine/simple'
import { act } from 'react'
import { BrowserRouter } from 'react-router'
import { render, renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { applyRecipe } from '../simple/applyRecipe'
import { SimplePanel } from '../simple/SimplePanel'
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
 * it names is already built, so this file is a statement of the contract
 * rather than a discovery about it.
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
 * All ten rows are here. Cases 1–8 are the advanced view's; cases 9–18 are
 * the simple view's three rows of its own, and the simple halves of four rows
 * the advanced view shares — Generate and New seed draw the knobs afresh first
 * when randomising (`lab-page.ts:912-921`), Defaults resets the recipe
 * (`:923-930`), and the page opens on the recipe unless it opened on a link
 * (`:1479-1480`).
 *
 * Cases 9 and 10 drive the store the way the size card and the slider do —
 * `setSide`/`setSlider`, then `applyRecipe(false)` — rather than the inputs:
 * fake timers and Playwright's pointer do not mix, and the cards' own wiring is
 * `SimplePanel.browser.test.tsx`'s subject.
 *
 * The control is a stub everywhere but cases 8 and 16–18, which mount `App`
 * with the real one: what a trigger does to the worker is
 * `useGenerator.browser.test.tsx`'s subject, and what it does to the knobs is
 * this one's.
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
  state.result.reset()
  state.ui.setAuto(false)
  state.ui.setHelp(true)
  state.ui.raiseClamped(false)
  state.ui.setMode('advanced')
  state.recipe.reset()
  state.recipe.setRandom(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
  // set by `started()` and survives `completeRun()`, so it answers whichever side
  // of the carve the poll lands on.
  it('8 · page load, advanced view: a run without a click, on the knobs the page opened with', async () => {
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    // No hash was pasted, so the knobs the load run used are the page's own.
    // The simple view's half is case 16.
    expect(useStore.getState().run.params).toEqual(defaultParams())
  }, 40_000)

  // Row 3, simple view. Auto stays off, from `beforeEach`: the row's whole
  // point is that the simple view's debounce does not ask the switch.
  it('9 · a simple size field: once, 350 ms later, with auto off, on the knobs the recipe gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    await renderHook(() => useAutoRun(r.control))
    vi.useFakeTimers()
    await act(async () => {
      useStore.getState().recipe.setSide('W', 120)
      applyRecipe(false)
    })
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(r.seen).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.W).toBe(120)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // Row 4. `shape` at 0.9 moves `pStraight` off its default, so a run on
  // stale knobs cannot satisfy the equality.
  it('10 · a simple slider: once, 350 ms later, with auto off, on the knobs the recipe gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    await renderHook(() => useAutoRun(r.control))
    vi.useFakeTimers()
    await act(async () => {
      useStore.getState().recipe.setSlider('shape', 0.9)
      applyRecipe(false)
    })
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(r.seen).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.pStraight).not.toBe(defaultParams().pStraight)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // Row 5: immediate, and the knobs rewritten before the run reads them.
  it('11 · the simple segmented button: at once, on the knobs the new skeleton gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    const screen = await render(<SimplePanel control={r.control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.giants).not.toBe(defaultParams().giants)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // Row 6, simple view with randomising on. `Math.random` pinned, so the draw
  // is reproducible: the snapshot must be the pinned draw, not the canonical
  // knobs the recipe gives without one.
  it('12 · Generate in the simple view with randomising: at once, on a fresh draw', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setRandom(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(r.seen).toHaveLength(1)
    const recipe = useStore.getState().recipe.value
    expect(r.seen[0]).toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, () => 0.99))
    expect(r.seen[0]).not.toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, null))
  })

  // The same row without randomising: the simple view alone rewrites nothing.
  it('13 · Generate in the simple view without randomising: at once, rewriting nothing', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().params.setMany({ W: 33, H: 66, seed: 7 })
    const before = { ...useStore.getState().params.values }
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(r.seen).toEqual([before])
  })

  // Row 7, simple view with randomising on. One pinned value feeds both the
  // seed (`Math.floor(0.5 * 999999)`) and the draw. The order of the two is not
  // claimed: `simpleParams` draws without reading the seed and only writes it
  // back, so either order gives this snapshot (verified in review).
  it('14 · New seed in the simple view with randomising: at once, on the new seed and a fresh draw', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setRandom(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.seed).toBe(499999)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: 499999 }, () => 0.5))
  })

  // Row 8, simple view: the recipe goes back too, keeping `random`, and is
  // written without a draw — the default recipe gives the engine defaults.
  it('15 · Defaults in the simple view: at once, on the defaults, with the recipe reset and random kept', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().params.setMany({ W: 77, seed: 5 })
    useStore.getState().recipe.setSlider('lengths', 0.1)
    useStore.getState().recipe.setRandom(true)
    const random = vi.spyOn(Math, 'random')
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(r.seen).toEqual([defaultParams()])
    expect(useStore.getState().recipe.value).toEqual(recipeOf({ ...defaultChoice(), random: true }))
    expect(random).not.toHaveBeenCalled()
  })

  // Row 10, simple view, the real control. The recipe is moved before the
  // mount, so a load run on the defaults cannot pass.
  it('16 · page load in the simple view: a run on the knobs the recipe gives', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    const recipe = useStore.getState().recipe.value
    expect(useStore.getState().run.params).toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, null))
    expect(useStore.getState().run.params).not.toEqual(defaultParams())
  }, 40_000)

  // Ruling 11: a page that opened on a link keeps the link's knobs, and the
  // recipe — moved here so that applying it would show — is not applied.
  it('17 · page load in the simple view from a link: a run on the link’s knobs, not the recipe’s', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    history.replaceState(null, '', encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }))
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    expect(useStore.getState().run.params).toEqual({ ...defaultParams(), W: 61 })
  }, 40_000)
  // Ruling 11's other half: a hash that decodes and names no knob is still a
  // link — `loadFromUrl` returns true once the JSON parses. An
  // `openedFromLink` meaning "named a knob" would apply the moved recipe here.
  it('18 · page load in the simple view from a link naming nothing: a run on the defaults, not the recipe’s', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    history.replaceState(null, '', '#' + encodeURIComponent('{}'))
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    expect(useStore.getState().run.params).toEqual(defaultParams())
  }, 40_000)
})
