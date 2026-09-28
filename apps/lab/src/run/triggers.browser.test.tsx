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
 * Every run trigger: when it starts a run, and with which knobs. The recorder
 * snapshots the knobs at the call to `start()`, because a trigger that rewrites
 * them (preset, New seed, Defaults) must do so before it runs; read from the
 * store afterwards, the two orders look the same.
 *
 * The simple-view size and slider cases drive the store (`setSide`/`setSlider`,
 * then `applyRecipe(false)`), not the inputs: fake timers and Playwright's
 * pointer do not mix. The page-load cases mount `App` with the real control.
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

/**
 * A seed pinned for the cases that have to know which one was drawn. Above
 * 999999 on purpose: it survives the knob only if the full 32-bit range does.
 */
const PINNED_SEED = 3_000_000_000

/** `getRandomValues` fills the array it is handed and returns that same array; the stub does both. */
function pinSeed(value: number): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    if (array instanceof Uint32Array) array[0] = value
    return array
  })
}

/** Case 7's host: `useUrlHash` calls `useLocation()`, so it needs a router. */
function HashHost({ control }: { control: RunControl }) {
  useUrlHash(control)
  return null
}

beforeEach(() => {
  // The fragment first: `useUrlHash` reads it at mount, and a link left by one
  // case would be read by the next as a pasted one.
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.ui.setAuto(false)
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
  // Fake timers go on *after* the render and without `shouldAdvanceTime`, and
  // the assertions are plain `expect`: `expect.element` polls, and a poll
  // against a frozen clock hangs rather than fails.
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
    // 31, not the default 25: the run carries the edit, not an older value.
    expect(r.seen[0]?.W).toBe(31)
  })

  // The switch is what makes the debounce exist at all.
  it('2 · a knob edit with auto off: never', async () => {
    const r = recorder()
    await renderHook(() => useAutoRun(r.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 32))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(r.seen).toHaveLength(0)
  })

  // Hard portrait, not a small preset: `exportCell` saturates at 18 up to 91
  // cells on the longer side, so a stale 18 would pass. 75×150 gives 11,
  // neither 18 nor the view slice's starting 12.
  it('3 · a preset: at once, with every knob and the export cell rewritten first', async () => {
    const r = recorder()
    const option = PRESETS.flatMap((level) => level.options).find((o) => o.id === 'hard-portrait')
    if (option === undefined) throw new Error('PRESETS has no hard-portrait')
    const screen = await render(<PresetStrip control={r.control} />)
    await screen.getByRole('button', { name: /^preset/ }).click()
    await screen.getByRole('button', { name: /Hard.*tall/ }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.W).toBe(option.params.W)
    expect(r.seen[0]?.H).toBe(option.params.H)
    expect(useStore.getState().view.cell).toBe(exportCell(75, 150))
  })

  // `before` is a size no default carries, so "every knob unchanged" is a claim
  // about the console's state, not about `defaultParams()`.
  it('4 · Generate: at once, rewriting nothing', async () => {
    const r = recorder()
    useStore.getState().params.setMany({ W: 33, H: 66, seed: 7 })
    const before = { ...useStore.getState().params.values }
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]).toEqual(before)
  })

  // The second assertion is the order: with `start()` called before `setMany`,
  // only the snapshot would still read 1.
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

  // One knob is moved into a broken rule, because Defaults is the way out of
  // one: a Defaults that ran before resetting would be refused by `useRun`.
  it('6 · Defaults: at once, on defaultParams()', async () => {
    const r = recorder()
    useStore.getState().params.setMany({ W: 77, seed: 5, wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]).toEqual(defaultParams())
  })

  // An external `hashchange`, a link pasted into the bar. The listener in
  // `useUrlHash` returns when the fragment already encodes the store, so a
  // fragment matching the screen is never a trigger, whoever put it there.
  it('7 · an external hashchange: at once, on the knobs the link named', async () => {
    const r = recorder()
    await render(
      <BrowserRouter>
        <HashHost control={r.control} />
      </BrowserRouter>,
    )
    location.hash = encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }).slice(1)
    await vi.waitFor(() => expect(r.seen).toHaveLength(1))
    // 61, not the default 25, and on the snapshot: the store holds 61 under
    // either order, so only the snapshot shows the link applied before the run.
    expect(r.seen[0]?.W).toBe(61)
  })

  // The real control, because "a run started" is here a claim about `App` and
  // its hooks. `run.params`, not `run.phase`: the 25×50 board finishes in
  // milliseconds, and `params` survives `completeRun()`.
  it('8 · page load, advanced view: a run without a click, on the knobs the page opened with', async () => {
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    // No hash was pasted, so the load run used the page's own knobs.
    expect(useStore.getState().run.params).toEqual(defaultParams())
  }, 40_000)

  // Auto stays off, from `beforeEach`: the simple view's debounce does not ask the switch.
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

  // `shape` at 0.9 moves `pStraight` off its default, so a run on stale knobs cannot pass.
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

  // Immediate, and the knobs rewritten before the run reads them.
  it('11 · the simple segmented button: at once, on the knobs the new skeleton gives', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    const screen = await render(<SimplePanel control={r.control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.giants).not.toBe(defaultParams().giants)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: defaultParams().seed }, null))
  })

  // `Math.random` pinned, so the snapshot must be the pinned draw, not the
  // canonical knobs the recipe gives without one.
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

  // Two sources, pinned separately: the seed from `getRandomValues`, the draw
  // from `Math.random`. Their order is not claimed: `simpleParams` draws
  // without reading the seed, so either order gives this snapshot.
  it('14 · New seed in the simple view with randomising: at once, on the new seed and a fresh draw', async () => {
    const r = recorder()
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setRandom(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    pinSeed(PINNED_SEED)
    const screen = await render(<RunColumn control={r.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(r.seen).toHaveLength(1)
    expect(r.seen[0]?.seed).toBe(PINNED_SEED)
    expect(r.seen[0]).toEqual(simpleParams({ ...useStore.getState().recipe.value, seed: PINNED_SEED }, () => 0.5))
  })

  // The recipe goes back too, keeping `random`, and is written without a draw:
  // the default recipe gives the engine defaults.
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

  // The real control. The recipe is moved before the mount, so a load run on
  // the defaults cannot pass.
  it('16 · page load in the simple view: a run on the knobs the recipe gives', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    const recipe = useStore.getState().recipe.value
    expect(useStore.getState().run.params).toEqual(simpleParams({ ...recipe, seed: defaultParams().seed }, null))
    expect(useStore.getState().run.params).not.toEqual(defaultParams())
  }, 40_000)

  // A page that opened on a link keeps the link's knobs, and the recipe (moved
  // here so that applying it would show) is not applied.
  it('17 · page load in the simple view from a link: a run on the link’s knobs, not the recipe’s', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    history.replaceState(null, '', encodeHash({ params: { ...defaultParams(), W: 61 }, view: VIEW, carried: {} }))
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    expect(useStore.getState().run.params).toEqual({ ...defaultParams(), W: 61 })
  }, 40_000)
  // A hash that decodes and names no knob is still a link: `loadFromUrl` returns
  // true once the JSON parses. An `openedFromLink` meaning "named a knob"
  // would apply the moved recipe here.
  it('18 · page load in the simple view from a link naming nothing: a run on the defaults, not the recipe’s', async () => {
    useStore.getState().ui.setMode('simple')
    useStore.getState().recipe.setSlider('lengths', 0.2)
    history.replaceState(null, '', '#' + encodeURIComponent('{}'))
    await render(<App />)
    await expect.poll(() => useStore.getState().run.params !== null, { timeout: 30_000 }).toBe(true)
    expect(useStore.getState().run.params).toEqual(defaultParams())
  }, 40_000)
})
