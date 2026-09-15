import { reportDelta, reportRows, type StatRow } from '@arrowz/engine/report'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { Baseline, ShownResult } from '../state/result.slice'

/** The rows between separators, each with its index in the whole table — the index a delta is keyed by. */
function groupsOf(rows: readonly StatRow[]): { row: StatRow; at: number }[][] {
  const groups: { row: StatRow; at: number }[][] = [[]]
  rows.forEach((row, at) => {
    if (row.kind === 'separator') groups.push([])
    else groups[groups.length - 1]?.push({ row, at })
  })
  return groups
}

/**
 * The 23 statistics of the board on screen, in the engine's order and words,
 * with the change against the baseline (spec §5.3). Both reports are built at
 * render in the current language and compared by row index, which a language
 * switch does not move; nothing here moves the baseline.
 */
export function StatsTable({
  result,
  baseline,
}: {
  result: ShownResult
  baseline: Baseline | null
}): ReactElement | null {
  const dict = useDictionary()
  const rows = reportRows(result.report, result.params, dict)
  // A run without metrics reports no rows (lab-report.ts), and the table goes.
  if (rows.length === 0) return null
  const before = baseline === null ? [] : reportRows(baseline.report, baseline.params, dict)
  return (
    <table className="fw-stats" aria-label={dict.t('statsTable')}>
      {groupsOf(rows).map((group) => (
        <tbody key={group[0]?.at ?? 0}>
          {group.map(({ row, at }) => {
            const change = reportDelta(row.num, before[at]?.num, row.better)
            return (
              <tr key={at}>
                <th scope="row">{row.label}</th>
                <td className="num">{row.value}</td>
                {/* The sign is always printed, so colour is never the only
                    carrier; a screen reader hears better or worse (Ruling 4). */}
                <td className={change === null ? 'fw-delta' : `fw-delta ${change.trend}`}>
                  {change?.text}
                  {change === null || change.trend === 'neutral' ? null : (
                    <span className="fw-vh">{` ${dict.t(change.trend === 'better' ? 'deltaBetter' : 'deltaWorse')}`}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}
