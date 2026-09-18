import { useCallback, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import type { GeneratorHandle } from '../worker/useGenerator'

export interface RunControl {
  /** Starts a run from the knobs as they stand. Refuses while a rule is broken. */
  start(): void
  /** Terminates the worker if one is carving; does nothing otherwise. */
  abort(): void
  /** Registers the cancel of a debounce that has not fired. Task 8 calls it. */
  hold(cancel: () => void): void
}

/**
 * The one place a run begins: every way of starting one (button,
 * auto-generate, preset, URL, reseed) ends here, so this is the one place the
 * envelope is enforced. Seven triggers call `start()`; none of them has
 * to remember to check the rules or to cancel a pending debounce.
 *
 * The knobs are read with `getState()` at the call rather than through a
 * subscription: a run must use the values of the moment it started, and a
 * subscription here would rerender the shell on every drag (Ruling 11).
 */
export function useRun(generator: GeneratorHandle): RunControl {
  const cancel = useRef<(() => void) | null>(null)

  const start = useCallback(() => {
    // Before the refusal, not after: a refused trigger must still clear the
    // timer, or the debounce fires into the same refusal a moment later.
    cancel.current?.()
    const { params } = useStore.getState()
    // Silent here, spoken by `RunStatusBar` (Ruling 13): a funnel that logged
    // its own refusal would be a second voice for the rule `Violations`
    // already states.
    if (params.violations.length > 0) return
    generator.start(params.values)
  }, [generator])

  const abort = useCallback(() => generator.abort(), [generator])
  const hold = useCallback((fn: () => void) => {
    cancel.current = fn
  }, [])

  return useMemo(() => ({ start, abort, hold }), [start, abort, hold])
}
