import { type BoardMeta, readParams } from '@arrowz/engine'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewFieldsOf } from '../state/view.slice'

/**
 * The knobs, then the view, then one run and the lab. `start()`, not
 * `generate()`: in the simple view that would draw new knobs over these.
 */
export function loadIntoLab(meta: BoardMeta, control: RunControl, navigate: (path: string) => void): void {
  const { params, ui, view } = useStore.getState()
  ui.raiseClamped(params.setMany(readParams(meta.params)))
  view.apply(viewFieldsOf(meta.view))
  control.start()
  navigate('/')
}
