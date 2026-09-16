import { ReportPanel } from '../report/ReportPanel'
import { BoardFrame } from './BoardFrame'

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until the filmstrip fills it (PR 7); the column stays, so the board's width
 * does not move when it arrives. The report is the third track above 900px
 * and a row under both below it (shell.css).
 */
export function Stage() {
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <BoardFrame />
      <ReportPanel />
    </div>
  )
}
