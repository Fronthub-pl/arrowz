import { renderHook } from 'vitest-browser-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultParams } from '@arrowz/engine'
import type { GeneratorHandle } from '../worker/useGenerator'
import type { SeriesHandle } from '../series/useSeries'
import { useStore } from '../state/store'
import { useRun } from './useRun'

function stub() {
  const calls = { start: 0, abort: 0 }
  const saves: boolean[] = []
  const generator: GeneratorHandle = {
    start: (_params, save) => {
      calls.start++
      saves.push(save)
    },
    abort: () => void calls.abort++,
  }
  const series: SeriesHandle = { start: vi.fn(), abort: vi.fn() }
  return { generator, series, saves, started: () => calls.start, aborted: () => calls.abort }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.series.reset()
  state.ui.setSaveEvery(false)
})

describe('useRun', () => {
  it('hands the worker the knobs as they stand at the call', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().params.set('W', 33)
    result.current.start()
    expect(g.started()).toBe(1)
  })

  // The button is disabled too, but `auto` and a link arriving from another
  // window are not buttons, so the refusal lives here.
  it('refuses while a rule is broken, whoever asked', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    result.current.start()
    expect(g.started()).toBe(0)
  })

  it('cancels a debounce that has not fired before starting', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    const cancel = vi.fn()
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  // Cancelling comes first: a refused run must still clear the timer, or the
  // debounce fires 350 ms later into the same refusal.
  it('cancels even when it then refuses', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    const cancel = vi.fn()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(g.started()).toBe(0)
  })

  it('passes an abort straight through', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    result.current.abort()
    expect(g.aborted()).toBe(1)
  })

  it('no run starts while a series runs — auto-generate included', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().series.started(defaultParams(), 3)
    result.current.start()
    expect(g.started()).toBe(0)
  })

  it('Check seeds starts a series from the knobs as they stand', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().params.set('seed', 41)
    result.current.checkSeeds()
    expect(g.series.start).toHaveBeenCalledWith(expect.objectContaining({ seed: 41 }))
  })

  it('Check seeds refuses while a run is in flight or a rule is broken', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().run.started(defaultParams())
    result.current.checkSeeds()
    expect(g.series.start).not.toHaveBeenCalled()
  })

  it('Abort stops the series when one runs, not the generator', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().series.started(defaultParams(), 3)
    result.current.abort()
    expect(g.series.abort).toHaveBeenCalled()
    expect(g.aborted()).toBe(0)
  })
})

describe('the intent to save', () => {
  it('is off for a plain start with the switch off', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    result.current.start()
    expect(g.saves).toEqual([false])
  })

  it('is on when the start asks for it, whatever the switch says', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    result.current.start({ save: true })
    expect(g.saves).toEqual([true])
  })

  it('is on for every start while the switch is on', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series))
    useStore.getState().ui.setSaveEvery(true)
    result.current.start()
    result.current.start({ save: false })
    expect(g.saves).toEqual([true, true])
  })
})
