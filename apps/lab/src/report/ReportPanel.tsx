import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { useInLibrary } from '../library/useInLibrary'
import { useStore } from '../state/store'
import { LongestTable } from './LongestTable'
import { StatsTable } from './StatsTable'

/** The report's id, for the drawer handle's `aria-controls` (Stage.tsx). */
export const REPORT_ID = 'lab-report'

/**
 * The report drawer's content (spec §4.1): the report of the result on screen, in
 * both views, scrolling inside itself. It reads the result slice, so a run in
 * flight leaves it describing the board it sits beside — and the route, which
 * empties the report on the saved-boards tab.
 */
export function ReportPanel(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const inLibrary = useInLibrary()
  const baseline = useStore((state) => state.result.baseline)
  // Both tables are hidden on the library tab — on the tab, not merely when a
  // board is chosen there, which is why this asks the route and not the
  // preview. A stored board has no run to report, and `longestSummary`
  // sorts every piece, about 90 000 at Insane (spec §5.3).
  const shown = inLibrary ? null : result
  return (
    <section id={REPORT_ID} className="fw-report" aria-label={dict.t('reportPanel')}>
      {shown === null ? null : (
        <>
          <StatsTable result={shown} baseline={baseline} />
          <LongestTable board={shown.board} />
        </>
      )}
    </section>
  )
}
