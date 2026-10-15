import { renderHook } from 'vitest-browser-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultParams } from '@fronthub/arrowz-engine'
import type { GeneratorHandle } from '../worker/useGenerator'
import type { SeriesHandle } from '../series/useSeries'
import type { FillHandle } from '../series/useFill'
import { useStore } from '../state/store'
import { useRun } from './useRun'

function stub() {
  const calls = { start: 0, abort: 0 }
  const saves: boolean[] = []
  const storedIds: (string | null)[] = []
  const generator: GeneratorHandle = {
    start: (_params, intent) => {
      calls.start++
      saves.push(intent.save)
      storedIds.push(intent.storedId)
    },
    abort: () => void calls.abort++,
  }
  const series: SeriesHandle = { start: vi.fn(), abort: vi.fn() }
  const fill: FillHandle = { start: vi.fn(), abort: vi.fn() }
  return { generator, series, fill, saves, storedIds, started: () => calls.start, aborted: () => calls.abort }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.series.reset()
  state.fill.reset()
  state.ui.setSaveEvery(false)
})

describe('useRun', () => {
  it('hands the worker the knobs as they stand at the call', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().params.set('W', 33)
    result.current.start()
    expect(g.started()).toBe(1)
  })

  // The button is disabled too, but `auto` and a link arriving from another
  // window are not buttons, so the refusal lives here.
  it('refuses while a rule is broken, whoever asked', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    result.current.start()
    expect(g.started()).toBe(0)
  })

  it('cancels a debounce that has not fired before starting', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    const cancel = vi.fn()
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  // Cancelling comes first: a refused run must still clear the timer, or the
  // debounce fires 350 ms later into the same refusal.
  it('cancels even when it then refuses', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    const cancel = vi.fn()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(g.started()).toBe(0)
  })

  it('passes an abort straight through', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    result.current.abort()
    expect(g.aborted()).toBe(1)
  })

  it('no run starts while a series runs — auto-generate included', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().series.started(defaultParams(), 3)
    result.current.start()
    expect(g.started()).toBe(0)
  })

  it('Check seeds starts a series from the knobs as they stand', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().params.set('seed', 41)
    result.current.checkSeeds()
    expect(g.series.start).toHaveBeenCalledWith(expect.objectContaining({ seed: 41 }))
  })

  it('Check seeds refuses while a run is in flight or a rule is broken', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().run.started(defaultParams())
    result.current.checkSeeds()
    expect(g.series.start).not.toHaveBeenCalled()
  })

  it('Abort stops the series when one runs, not the generator', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().series.started(defaultParams(), 3)
    result.current.abort()
    expect(g.series.abort).toHaveBeenCalled()
    expect(g.aborted()).toBe(0)
  })

  it('Save many boards starts a batch from the knobs as they stand', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().params.set('seed', 41)
    result.current.fillLibrary()
    expect(g.fill.start).toHaveBeenCalledWith(expect.objectContaining({ seed: 41 }))
  })

  it('Save many boards refuses while a series runs or a rule is broken', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().series.started(defaultParams(), 3)
    result.current.fillLibrary()
    useStore.getState().series.reset()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    result.current.fillLibrary()
    expect(g.fill.start).not.toHaveBeenCalled()
  })

  it('refuses a run and a series while a batch is in flight', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().fill.started(defaultParams(), 2, 4)
    result.current.start()
    result.current.checkSeeds()
    expect(g.started()).toBe(0)
    expect(g.series.start).not.toHaveBeenCalled()
  })

  it('Abort stops the batch when one runs, not the generator', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().fill.started(defaultParams(), 2, 4)
    result.current.abort()
    expect(g.fill.abort).toHaveBeenCalled()
    expect(g.aborted()).toBe(0)
  })
})

describe('the intent to save', () => {
  it('is off for a plain start with the switch off', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    result.current.start()
    expect(g.saves).toEqual([false])
  })

  it('is on when the start asks for it, whatever the switch says', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    result.current.start({ save: true })
    expect(g.saves).toEqual([true])
  })

  it('is on for every start while the switch is on', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    useStore.getState().ui.setSaveEvery(true)
    result.current.start()
    result.current.start({ save: false })
    expect(g.saves).toEqual([true, true])
  })

  // Load into lab names the stored layout; the run carries it without saving.
  it('hands the worker the stored layout a start names, and none otherwise', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator, g.series, g.fill))
    result.current.start({ storedId: 'sha256-x' })
    result.current.start()
    expect(g.storedIds).toEqual(['sha256-x', null])
    expect(g.saves).toEqual([false, false])
  })
})
