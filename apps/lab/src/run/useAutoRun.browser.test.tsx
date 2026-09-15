import { act } from 'react'
import { renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { AUTO_DELAY_MS, useAutoRun } from './useAutoRun'

function stub() {
  const calls = { start: 0 }
  let cancel: (() => void) | null = null
  const control: RunControl = {
    start: () => void calls.start++,
    abort: () => {},
    hold: (fn) => void (cancel = fn),
  }
  return { control, started: () => calls.start, cancelPending: () => cancel?.() }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.ui.setAuto(false)
  state.recipe.reset()
  state.recipe.setRandom(false)
})
afterEach(() => vi.useRealTimers())

describe('useAutoRun', () => {
  it('does nothing while the switch is off, however many knobs move', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  it('runs once, 350 ms after the last of a burst of edits', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(200)
    await act(async () => useStore.getState().params.set('W', 32))
    await vi.advanceTimersByTimeAsync(349)
    expect(g.started()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(g.started()).toBe(1)
  })

  // Ruling 3, from the other side: the machine path must be invisible here.
  it('ignores what a preset, Defaults or a link applied', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.setMany({ W: 40, H: 40 }))
    await act(async () => useStore.getState().params.reset())
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  it('does not run on being switched on: the switch arms the next edit', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 33))
    await act(async () => useStore.getState().ui.setAuto(true))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  // Switching off with a timer already running must not carve anyway.
  it('does not run when the switch goes off inside the wait', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 34))
    await vi.advanceTimersByTimeAsync(100)
    await act(async () => useStore.getState().ui.setAuto(false))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS)
    expect(g.started()).toBe(0)
  })

  it('hands its timer to the control, so any other trigger can cancel it', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    useStore.getState().ui.setAuto(true)
    vi.useFakeTimers()
    await act(async () => useStore.getState().params.set('W', 35))
    g.cancelPending()
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })
})

describe('the recipe, which does not ask the switch', () => {
  it('runs 350 ms after a slider moves, with auto off', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSlider('lengths', 0.3))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(g.started()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(g.started()).toBe(1)
  })

  it('runs once for a size and a slider moved inside one wait', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSide('W', 30))
    await vi.advanceTimersByTimeAsync(200)
    await act(async () => useStore.getState().recipe.setSlider('shape', 0.7))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(1)
  })

  // The skeleton switch runs at once through its own handler, and randomising
  // runs nothing; a debounce behind either would carve a second time.
  it('does not run for the skeleton switch or the random switch', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSkeleton('on'))
    await act(async () => useStore.getState().recipe.setRandom(true))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  // Ruling 3's debt. With one timer for both kinds, a knob edit with auto off
  // restarts the wait; it must not also forget the recipe run it restarted.
  it('keeps a recipe run it owes when a knob edit with auto off lands inside the wait', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSide('W', 30))
    await vi.advanceTimersByTimeAsync(200)
    await act(async () => useStore.getState().params.set('W', 31))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1)
    expect(g.started()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(g.started()).toBe(1)
  })

  it('lets any other trigger cancel a recipe run it owes', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSlider('shape', 0.2))
    g.cancelPending()
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })

  // The debt goes with the timer: a Generate that already ran the recipe must
  // not leave it owed to the next knob edit.
  it('does not pay a cancelled debt on the next knob edit with auto off', async () => {
    const g = stub()
    await renderHook(() => useAutoRun(g.control))
    vi.useFakeTimers()
    await act(async () => useStore.getState().recipe.setSlider('shape', 0.2))
    g.cancelPending()
    await act(async () => useStore.getState().params.set('W', 33))
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS * 3)
    expect(g.started()).toBe(0)
  })
})
