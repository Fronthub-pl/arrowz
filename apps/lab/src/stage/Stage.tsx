import { BoardFrame } from './BoardFrame'

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until the filmstrip fills it (PR 7); the column stays, so the board's width
 * does not move when it arrives. Task 4 adds the report as the third track.
 */
export function Stage() {
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <BoardFrame />
    </div>
  )
}
