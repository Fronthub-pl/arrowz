import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { selectedIndex } from '../shell/TabRow'
import { useStore } from '../state/store'
import { flash } from './flash'

/**
 * A jump waiting in `ui.focusTarget`, spent after the render that put its
 * control in the tree (spec §6). Mounted by `Console`, which is on screen for
 * both faces of the workspace: React commits the DOM and runs a parent's
 * effect after its children's, so the panel the jump asked for is already
 * there when this runs.
 *
 * **The lab tab is the only face that can spend a request**, and waiting for
 * it is not caution — it is the whole of what makes a jump from another route
 * work. ⌘K is bound everywhere, so `jumpTo` navigates to `/` before it asks
 * (spec §6); but react-router commits that navigation inside a transition,
 * one render *behind* the store write that made the request. Measured on this
 * branch with the gate absent: from `/boards` the request was spent while
 * `LibraryPanel` still held the panel slot and `#knob-seed` did not exist, and
 * from `/docs/*` the node was found inside `<main hidden>`, where `focus()` is
 * a no-op. Both left the palette closed and nothing else changed. With the
 * gate, the request simply survives that one render: `onLab` flips when the
 * route commits, and this effect runs again against the panel that has the
 * control.
 *
 * On the lab tab the request is then cleared whether or not the node was found
 * — a target that does not exist there will not exist later either, and must
 * not sit in the store waiting to hijack the next render.
 */
export function useFocusRequest(): void {
  const target = useStore((state) => state.ui.focusTarget)
  // `selectedIndex`, not a bare pathname test: the tab strip's own notion of
  // which face is on screen, the same one `App.tsx` computes `onWorkspace` from.
  const onLab = selectedIndex(useLocation().pathname) === 0
  useEffect(() => {
    if (target === null || !onLab) return
    useStore.getState().ui.clearFocusRequest()
    const node = document.getElementById(target)
    if (node === null) return
    node.focus()
    // The focus ring alone is easy to lose among twenty-eight controls, which
    // is why the mock outlines the whole knob box as well: a knob row
    // (handoff 2, PR 2) or a preview card.
    flash(node.closest('.kv-row'))
  }, [target, onLab])
}
