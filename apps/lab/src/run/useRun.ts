import { useCallback, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import type { Store } from '../state/store'
import type { SeriesHandle } from '../series/useSeries'
import type { GeneratorHandle } from '../worker/useGenerator'

export interface RunControl {
  /**
   * Starts a run from the knobs as they stand. Refuses while a rule is broken or a series runs.
   * The board is saved when `save` asks or the switch (`ui.saveEvery`) is on, decided now.
   * `storedId` names the stored layout the knobs were loaded from (Load into lab).
   */
  start(opts?: { save?: boolean; storedId?: string }): void
  /** Asks a run in flight to stop and keep its board; a second call discards it. Does nothing with no run. */
  abort(): void
  /** Registers the cancel of a debounce that has not fired. `useAutoRun` calls it. */
  hold(cancel: () => void): void
  /** Checks the knobs as they stand over the series' seeds. Refuses while a rule is broken or anything runs. */
  checkSeeds(): void
}

/** A normal run or a series: either keeps Generate, New seed and Check seeds off. */
export const inFlight = (state: Store): boolean => state.run.phase === 'running' || state.series.phase === 'running'

/**
 * The one place a run begins: every way of starting one (button,
 * auto-generate, preset, URL, reseed) ends here, so this is the one place the
 * envelope is enforced; no trigger has to remember to check the rules or to
 * cancel a pending debounce.
 *
 * The knobs are read with `getState()` at the call rather than through a
 * subscription: a run must use the values of the moment it started, and a
 * subscription here would rerender the shell on every drag.
 */
export function useRun(generator: GeneratorHandle, series: SeriesHandle): RunControl {
  const cancel = useRef<(() => void) | null>(null)

  const start = useCallback(
    (opts?: { save?: boolean; storedId?: string }) => {
      // Before the refusal, not after: a refused trigger must still clear the
      // timer, or the debounce fires into the same refusal a moment later.
      cancel.current?.()
      const state = useStore.getState()
      // Silent here: `RunStatusBar` speaks the refusal and `Violations` states
      // the rule, so a log here would be a second voice. A series keeps the cores.
      if (state.params.violations.length > 0 || state.series.phase === 'running') return
      generator.start(state.params.values, {
        save: opts?.save === true || state.ui.saveEvery,
        storedId: opts?.storedId ?? null,
      })
    },
    [generator],
  )

  const checkSeeds = useCallback(() => {
    cancel.current?.()
    const state = useStore.getState()
    if (state.params.violations.length > 0 || inFlight(state)) return
    series.start(state.params.values)
  }, [series])

  const abort = useCallback(() => {
    if (useStore.getState().series.phase === 'running') series.abort()
    else generator.abort()
  }, [generator, series])
  const hold = useCallback((fn: () => void) => {
    cancel.current = fn
  }, [])

  return useMemo(() => ({ start, abort, hold, checkSeeds }), [start, abort, hold, checkSeeds])
}
