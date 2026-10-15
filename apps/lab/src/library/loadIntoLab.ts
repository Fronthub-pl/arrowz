import { type BoardMeta, readParams } from '@fronthub/arrowz-engine'
import { poolRunning, type RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewFieldsOf } from '../state/view.slice'

/**
 * The knobs, then the view, then one run and the lab, from a stored board or
 * one of its recipes. `start()`, not `generate()`: in the simple view that
 * would draw new knobs over these. `storedId` names the stored layout the run
 * re-carves; a file opened from disk has none, whatever its meta says.
 */
export function loadIntoLab(
  source: Pick<BoardMeta, 'params' | 'view'>,
  control: RunControl,
  navigate: (path: string) => void,
  storedId?: string,
): void {
  const { params, ui, view } = useStore.getState()
  // Before the write: a series or a batch still running must keep the knobs it started with.
  if (poolRunning(useStore.getState())) return
  ui.raiseClamped(params.setMany(readParams(source.params)))
  view.apply(viewFieldsOf(source.view))
  if (storedId === undefined) control.start()
  else control.start({ storedId })
  navigate('/')
}
