import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { selectedIndex } from '../shell/TabRow'
import { useStore } from '../state/store'
import { flash } from './flash'

/**
 * A jump waiting in `ui.focusTarget`, spent after the render that put its
 * control in the tree. Mounted by `Console`: a parent's effect runs after its
 * children's, so the panel the jump asked for is already there.
 *
 * **Only the lab tab spends a request.** `jumpTo` navigates to `/` before it
 * asks, but react-router commits that navigation in a transition, one render
 * behind the store write. Without the gate, a jump from `/boards` found no
 * node, and one from `/docs/*` focused a node inside `<main hidden>` (a
 * no-op). With it, the request survives that render and this effect runs
 * again once `onLab` flips.
 *
 * On the lab tab the request is cleared whether or not the node was found: a
 * target missing there will not appear later, and must not hijack a render.
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
    // The focus ring alone is easy to lose among the controls, so the mock
    // outlines the whole row as well.
    flash(node.closest('.kv-row'))
  }, [target, onLab])
}
