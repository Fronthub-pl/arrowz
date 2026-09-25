import { reportDelta, reportRows, type StatKey, type StatRow } from '@arrowz/engine/report'
import { Fragment, type ReactElement, useId } from 'react'
import { useKnobHelp } from '../console/KnobRow'
import { useDictionary } from '../i18n'
import type { Baseline, ShownResult } from '../state/result.slice'

/** The rows the summary shows, in its order; `StatsTable` hides them while it does. */
export const SUMMARY_KEYS: readonly StatKey[] = ['pieces', 'longest', 'D', 'time']

/**
 * The four figures over the statistics: pieces, longest, D and time, each its
 * number, its term and its change against the baseline. The change is the
 * table's own `reportDelta`, so its colour is the row's trend and never the
 * sign. Time reports no change, and a first run has nothing to compare with:
 * both keep a hidden dash so the row keeps its height.
 *
 * The rows it repeats leave the table, so what they said beyond the number
 * stays here: D by its row's label, the whole value of longest and time as
 * the title of the number, and the rows' help behind one `?` by the caption,
 * since a figure's column is too narrow for a term and a button.
 */
export function ReportSummary({
  result,
  baseline,
}: {
  result: ShownResult
  baseline: Baseline | null
}): ReactElement | null {
  const dict = useDictionary()
  const cap = useId()
  const rows = reportRows(result.report, result.params, dict)
  const { button, open } = useKnobHelp('sum-help', dict.t('reportHelpAbout'), '')
  if (rows.length === 0) return null
  const before = baseline === null ? [] : reportRows(baseline.report, baseline.params, dict)
  const byKey = (list: readonly StatRow[], key: StatKey) => list.find((row) => row.key === key)
  return (
    <div className="fw-rsum-wrap">
      <div className="fw-rsum-hd">
        <p id={cap} className="fw-rsum-cap">
          {dict.t('reportSummaryCap')}
        </p>
        {button}
      </div>
      <dl className="fw-rsum" aria-describedby={cap}>
        {SUMMARY_KEYS.map((key) => {
          const row = byKey(rows, key)
          if (row === undefined || row.num === undefined) return null
          const change = key === 'time' ? null : reportDelta(row.num, byKey(before, key)?.num, row.better)
          return (
            <div key={key}>
              <dt>{row.label}</dt>
              <dd>
                <span className="v" title={key === 'longest' || key === 'time' ? row.value : undefined}>
                  {key === 'time'
                    ? dict.t('statSumSeconds', (row.num / 1000).toFixed(2))
                    : key === 'pieces' || key === 'D'
                      ? row.value
                      : dict.fmt(row.num)}
                </span>
                {change === null ? (
                  <small className="none">—</small>
                ) : (
                  <small className={change.trend}>
                    {change.text}
                    {change.trend === 'neutral' ? null : (
                      <span className="fw-vh">{` ${dict.t(change.trend === 'better' ? 'deltaBetter' : 'deltaWorse')}`}</span>
                    )}
                  </small>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      <dl id="sum-help" className={open ? 'kv-help fw-rsum-help' : 'kv-help fw-rsum-help fw-vh'}>
        {SUMMARY_KEYS.map((key) => {
          const row = byKey(rows, key)
          return row === undefined ? null : (
            <Fragment key={key}>
              <dt>{row.label}</dt>
              <dd>{row.help}</dd>
            </Fragment>
          )
        })}
      </dl>
    </div>
  )
}
