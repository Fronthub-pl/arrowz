import { boardViewOf } from '@arrowz/board-element'
import { type ReactElement, useMemo } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { BoardCanvas } from './BoardCanvas'

/**
 * The paper frame around the one `<arrowz-board>`, and what sits on it: the
 * annotation of the board on screen and, from Task 7, the solo toggle (spec
 * §5.1). Both come after the element in DOM order, because the element's host
 * is opaque and positioned, so tree order is what puts them on top; both are
 * absolutely positioned in `.fw-board`, so they take no height from the
 * element, and both keep to the top edge, which the element's own bar leaves
 * free (arrowz-board.ts:178-185).
 *
 * The element's view is memoised on the *slice's* identity, not rebuilt per
 * render: `run.progressed()` replaces `state.run` and leaves `state.view` and
 * `state.result` alone, so a run's progress messages reassign nothing on the element, while
 * editing a preview field redraws the board without generating.
 */
export function BoardFrame(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const view = useStore((state) => state.view)
  const lang = useStore((state) => state.lang.lang)
  const elementView = useMemo(() => boardViewOf(viewOf(view), view.voids), [view])
  return (
    <div className="fw-boardwrap">
      <div className="fw-board">
        <BoardCanvas board={result?.board ?? null} view={elementView} interactive={false} lang={lang} />
        {result === null ? null : (
          <span className="fw-anno">
            {dict.t('boardAnnotation', result.params.W, result.params.H, result.params.seed)}
          </span>
        )}
      </div>
    </div>
  )
}
