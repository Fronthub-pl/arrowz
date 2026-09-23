import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { useInLibrary } from '../library/useInLibrary'
import { useOpenPreview } from '../library/useOpenPreview'
import { useStore } from '../state/store'
import { LongestTable } from './LongestTable'
import { StatsTable } from './StatsTable'
import { StoredFacts } from './StoredFacts'

/** The report's id, for the drawer handle's `aria-controls` (Stage.tsx). */
export const REPORT_ID = 'lab-report'

/**
 * The report drawer's content (spec §4.1): the report of the board on screen,
 * scrolling inside itself. On the lab that is the run's result, so a run in
 * flight leaves it describing the board it sits beside. On the saved boards it
 * is the open board (handoff 2, PR 6): what the store keeps about it and its
 * longest pieces — on the tab, not merely when a preview is set, which is why
 * this asks the route; and nothing while no board the address names is drawn.
 */
export function ReportPanel(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const inLibrary = useInLibrary()
  const open = useOpenPreview()
  const baseline = useStore((state) => state.result.baseline)
  return (
    <section id={REPORT_ID} className="fw-report" aria-label={dict.t('reportPanel')}>
      {inLibrary
        ? open === null ? null : (
          <>
            <StoredFacts stored={open.stored} />
            <LongestTable board={open.stored.board} stored />
          </>
        )
        : result === null
        ? null
        : (
          <>
            <StatsTable result={result} baseline={baseline} />
            <LongestTable board={result.board} />
          </>
        )}
    </section>
  )
}
