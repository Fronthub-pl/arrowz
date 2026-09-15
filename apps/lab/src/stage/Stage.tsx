import { boardViewOf } from '@arrowz/board-element'
import { useMemo } from 'react'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { BoardCanvas } from './BoardCanvas'

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until the filmstrip fills it (PR 7); the column stays, so the board's width
 * does not move when it arrives.
 *
 * The element's view is memoised on the *slice's* identity, not rebuilt per
 * render: `run.progressed()` replaces `state.run` and leaves `state.view`
 * alone, so a run's twenty progress messages reassign nothing on the element,
 * while editing a preview field redraws the board without generating.
 */
export function Stage() {
  const board = useStore((state) => state.run.board)
  const view = useStore((state) => state.view)
  const lang = useStore((state) => state.lang.lang)
  const elementView = useMemo(() => boardViewOf(viewOf(view), view.voids), [view])
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <div className="fw-boardwrap">
        <div className="fw-board">
          <BoardCanvas board={board} view={elementView} interactive={false} lang={lang} />
        </div>
      </div>
    </div>
  )
}
