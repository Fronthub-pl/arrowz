import { useEffect } from 'react'
import { useStore } from '../state/store'
import { flash } from './flash'

/**
 * A jump waiting in `ui.focusTarget`, spent after the render that put its
 * control in the tree (spec §6). Mounted by `Console`, which is on screen for
 * both faces of the workspace: React commits the DOM and runs a parent's
 * effect after its children's, so the panel the jump asked for is already
 * there when this runs.
 *
 * The request is cleared whether or not the node was found — a target that no
 * longer exists must not sit in the store waiting to hijack the next render.
 */
export function useFocusRequest(): void {
  const target = useStore((state) => state.ui.focusTarget)
  useEffect(() => {
    if (target === null) return
    useStore.getState().ui.clearFocusRequest()
    const node = document.getElementById(target)
    if (node === null) return
    node.focus()
    // The focus ring alone is easy to lose among twenty-eight controls, which
    // is why the mock outlines the whole knob box as well.
    flash(node.closest('.fw-k'))
  }, [target])
}
