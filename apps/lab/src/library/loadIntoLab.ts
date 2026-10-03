import { type BoardMeta, readParams } from '@arrowz/engine'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewFieldsOf } from '../state/view.slice'

/**
 * The knobs, then the view, then one run and the lab, from a stored board or
 * one of its recipes. `start()`, not `generate()`: in the simple view that
 * would draw new knobs over these.
 */
export function loadIntoLab(
  source: Pick<BoardMeta, 'params' | 'view'>,
  control: RunControl,
  navigate: (path: string) => void,
): void {
  const { params, ui, view, series } = useStore.getState()
  // Before the write: a series still running must keep the knobs it started with.
  if (series.phase === 'running') return
  ui.raiseClamped(params.setMany(readParams(source.params)))
  view.apply(viewFieldsOf(source.view))
  control.start()
  navigate('/')
}
