import { useEffect } from 'react'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/** 350 ms, inherited rather than derived: the wait people are already used to. */
export const AUTO_DELAY_MS = 350

/**
 * Generate AUTO_DELAY_MS after the last knob or recipe edit. Mounted once, in `App`.
 *
 * - Subscribes inside the effect: a render selector would repaint the whole
 *   shell ~60×/s during a drag, and nothing in the shell is memoised against it.
 * - Watches `params.edits`, not `values`: a preset writes every knob and runs at
 *   once, and a watcher on the values could not tell it from a hand on a slider.
 * - Reads `ui.auto` both at the edit (switching it on arms the next edit, not
 *   the board on screen) and in the timer (switching it off cancels a pending run).
 * - Recipe edits ignore `auto` (the simple view has none) and leave a run owed
 *   until cancelled. One hook owns both, because `RunControl.hold` has a single
 *   cancel slot: two timers would overwrite it and Generate would leave one to fire.
 */
export function useAutoRun(control: RunControl): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // A recipe edit is waiting, and it runs whatever `auto` says.
    let owed = false
    const cancel = () => {
      clearTimeout(timer)
      owed = false
    }
    const unsubscribe = useStore.subscribe((state, prev) => {
      const typed = state.params.edits !== prev.params.edits
      const shaped = state.recipe.edits !== prev.recipe.edits
      if (!typed && !shaped) return
      // Not `cancel()`: restarting the wait must not forgive the debt.
      clearTimeout(timer)
      owed = owed || shaped
      if (!owed && !state.ui.auto) return
      timer = setTimeout(() => {
        const run = owed || useStore.getState().ui.auto
        owed = false
        if (run) control.start()
      }, AUTO_DELAY_MS)
      // Every other trigger calls `control.start()`, which calls this first, so
      // a preset chosen 100 ms after a keystroke does not carve twice.
      control.hold(cancel)
    })
    return () => {
      cancel()
      unsubscribe()
    }
  }, [control])
}
