import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LongestTable } from './LongestTable'
import { StatsTable } from './StatsTable'

/**
 * The stage's third column (spec §5.2): the report of the result on screen, in
 * both views, scrolling inside itself. It reads the result slice, so a run in
 * flight leaves it describing the board it sits beside.
 */
export function ReportPanel(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const baseline = useStore((state) => state.result.baseline)
  return (
    <section className="fw-report" aria-label={dict.t('reportPanel')}>
      {result === null ? null : (
        <>
          <StatsTable result={result} baseline={baseline} />
          <LongestTable board={result.board} />
        </>
      )}
    </section>
  )
}
