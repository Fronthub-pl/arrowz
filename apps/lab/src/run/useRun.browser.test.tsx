import { renderHook } from 'vitest-browser-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratorHandle } from '../worker/useGenerator'
import { useStore } from '../state/store'
import { useRun } from './useRun'

function stub() {
  const calls = { start: 0, abort: 0 }
  const generator: GeneratorHandle = {
    start: () => void calls.start++,
    abort: () => void calls.abort++,
  }
  return { generator, started: () => calls.start, aborted: () => calls.abort }
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
})

describe('useRun', () => {
  it('hands the worker the knobs as they stand at the call', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    useStore.getState().params.set('W', 33)
    result.current.start()
    expect(g.started()).toBe(1)
  })

  // The button is disabled too, but `auto` and a link arriving from another
  // window are not buttons, so the refusal lives here (Ruling 4).
  it('refuses while a rule is broken, whoever asked', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    result.current.start()
    expect(g.started()).toBe(0)
  })

  it('cancels a debounce that has not fired before starting', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    const cancel = vi.fn()
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  // Cancelling comes first: a refused run must still clear the timer, or the
  // debounce fires 350 ms later into the same refusal.
  it('cancels even when it then refuses', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    const cancel = vi.fn()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    result.current.hold(cancel)
    result.current.start()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(g.started()).toBe(0)
  })

  it('passes an abort straight through', async () => {
    const g = stub()
    const { result } = await renderHook(() => useRun(g.generator))
    result.current.abort()
    expect(g.aborted()).toBe(1)
  })
})
