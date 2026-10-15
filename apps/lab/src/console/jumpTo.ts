import { readBand } from '../state/band'
import { useStore } from '../state/store'
import type { RailEntry } from '../state/ui.slice'

/**
 * A jump: the face, then the panel that holds the control, then the control
 * itself. The palette's knob rows and the report's changed knobs both jump
 * through here, so a control is reached one way from either. `navigate` is the
 * caller's: it knows the address on screen.
 */
export function jumpTo(navigate: (path: string) => void, entry: RailEntry, id: string): void {
  const ui = useStore.getState().ui
  // The knobs are the lab face's alone: `/boards` puts the library in the
  // panel slot and `/docs/*` hides the workspace.
  navigate('/')
  // The knobs do not exist in the simple view either, so the jump has to bring
  // the console that has them.
  if (ui.mode === 'simple') ui.setMode('advanced')
  ui.select(entry)
  // The control has to be on screen, not merely in the tree: below 1024 the
  // settings drawer starts closed, and at XS the console is not rendered until
  // its sheet opens. The drawer is remembered open, as pressing `s` would.
  if (readBand() === 'xs') ui.setSheet('settings')
  else if (!ui.settings) ui.setSettings(true)
  ui.requestFocus(id)
}
