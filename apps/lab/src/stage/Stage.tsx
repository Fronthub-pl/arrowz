import { boardViewOf } from '@arrowz/board-element'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { useStore } from '../state/store'
import { BoardCanvas } from './BoardCanvas'

// Hoisted: a new object per render would change the element's `view` property
// identity on every progress message. The nine preview fields are PR 3, and
// this becomes a selector over the view slice then.
const VIEW = boardViewOf(DEFAULT_VIEW, false)

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until PR 7 fills it with the filmstrip; the column stays, so the board's
 * width does not move when it arrives.
 */
export function Stage() {
  const board = useStore((state) => state.run.board)
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <div className="fw-boardwrap">
        <div className="fw-board">
          <BoardCanvas board={board} view={VIEW} interactive={false} />
        </div>
      </div>
    </div>
  )
}
