import { useEffect } from 'react'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/** The old lab's own wait (`lab-page.ts:907-910`), named in one place. */
export const AUTO_DELAY_MS = 350

/**
 * Generate a while after the last knob was typed. Mounted once, in `App`.
 *
 * The subscription is inside the effect and not a `useStore(selector)` in
 * render (Ruling 11): `KnobSlider` commits on the range input's `onChange`,
 * about sixty times a second during a drag, and a selector here would repaint
 * the whole shell that often — the cost `useGenerator.ts:16-19` exists to
 * avoid, with nothing in `apps/lab` memoised against it.
 *
 * It watches `params.edits` and not `params.values`, for the reason Ruling 3
 * gives: a preset writes every knob at once and runs immediately, and a
 * watcher on the values could not tell that apart from a hand on a slider.
 *
 * `ui.auto` is read twice, and both readings matter. At the edit, so that
 * turning the switch on arms the *next* edit rather than carving the board
 * already on screen; and inside the timer, so that turning it off during the
 * wait cancels the run rather than merely stopping the next one.
 */
export function useAutoRun(control: RunControl): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancel = () => clearTimeout(timer)
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.params.edits === prev.params.edits) return
      cancel()
      if (!state.ui.auto) return
      timer = setTimeout(() => {
        if (useStore.getState().ui.auto) control.start()
      }, AUTO_DELAY_MS)
      // Every other trigger calls `control.start()`, which calls this first.
      // That is what stops a preset chosen 100 ms after a keystroke from
      // carving twice (Ruling 4).
      control.hold(cancel)
    })
    return () => {
      cancel()
      unsubscribe()
    }
  }, [control])
}
