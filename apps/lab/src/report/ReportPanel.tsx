import type { ReactElement, ReactNode } from 'react'
import { useDictionary } from '../i18n'
import { useInLibrary } from '../library/useInLibrary'
import { useOpenPreview } from '../library/useOpenPreview'
import { useStore } from '../state/store'
import { FileFacts } from './FileFacts'
import { LongestTable } from './LongestTable'
import { ReportSummary } from './ReportSummary'
import { RunFacts } from './RunFacts'
import { StatsTable } from './StatsTable'
import { StoredFacts } from './StoredFacts'

/** The report's id, for the drawer handle's `aria-controls`. */
export const REPORT_ID = 'lab-report'

/**
 * The report drawer's content: the report of the board on screen, scrolling
 * inside itself. On the lab that is the run's result, so a run in flight leaves
 * it describing the board it sits beside. On the saved boards it is the open
 * board: what the store keeps about it and its longest pieces. That holds on
 * the tab, not merely when a preview is set, which is why this asks the route;
 * and it shows nothing while no board the address names is drawn.
 *
 * `series` is a slot: the lab's `SeriesSection`, mounted above the run's own
 * report even while it has none, so a series just finished still shows before
 * a board has run.
 */
export function ReportPanel({ series = null }: { series?: ReactNode }): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const inLibrary = useInLibrary()
  const open = useOpenPreview()
  const baseline = useStore((state) => state.result.baseline)
  return (
    <section id={REPORT_ID} className="fw-report" aria-label={dict.t('reportPanel')}>
      {inLibrary ? (
        open === null ? null : open.origin === 'file' ? (
          <>
            <FileFacts opened={open.opened} />
            <LongestTable board={open.opened.board} stored />
          </>
        ) : (
          <>
            <StoredFacts meta={open.stored.meta} />
            <LongestTable board={open.stored.board} stored />
          </>
        )
      ) : (
        <>
          {series}
          {result === null ? null : (
            <>
              <ReportSummary result={result} baseline={result.report.aborted ? null : baseline} />
              <StatsTable result={result} baseline={result.report.aborted ? null : baseline} />
              <RunFacts file={result.file} />
              <LongestTable board={result.board} />
            </>
          )}
        </>
      )}
    </section>
  )
}
