import { genSeconds, pct } from '@arrowz/engine/report'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { StoredBoard } from '../state/result.slice'

/**
 * The report of a stored board (handoff 2, PR 6): what the store keeps beside
 * it, in the statistics table's form and words. Not the 23 rows of a run: those
 * are read off the carver and its metrics, which a stored board does not carry
 * — `StoredBoard` is deliberately no `ShownResult` (spec §5.3) — and inventing
 * them is what that type exists to prevent. A figure the writer did not have
 * reads as a dash; the note under the table says where the rest comes from.
 */
export function StoredFacts({ stored }: { stored: StoredBoard }): ReactElement {
  const dict = useDictionary()
  const { meta } = stored
  const cells = meta.W * meta.H
  const dash = '—'
  const rows: [string, string][] = [
    [dict.t('stat_board'), dict.t('stat_boardVal', meta.W, meta.H, dict.fmt(cells), meta.seed)],
    [dict.t('stat_pieces'), meta.pieces === null ? dash : dict.fmt(meta.pieces)],
    [dict.t('stat_avgLen'), meta.pieces === null || meta.pieces === 0 ? dash : (cells / meta.pieces).toFixed(1)],
    [
      dict.t('stat_longest'),
      meta.maxLen === null ? dash : dict.t('stat_longestVal', meta.maxLen, pct(meta.maxLen / cells)),
    ],
    [dict.t('stat_backtracks'), `${meta.backtracks ?? dash} / ${meta.restarts ?? dash}`],
    [dict.t('stat_time'), dict.t('stat_genVal', genSeconds(meta, dash))],
  ]
  return (
    <>
      {meta.ok === null ? null : <p>{meta.ok ? dict.t('closed') : dict.t('notClosedShort')}</p>}
      <table className="fw-stats" aria-label={dict.t('statsTable')}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="num">{value}</td>
              <td className="fw-delta" />
            </tr>
          ))}
        </tbody>
      </table>
      <p>{dict.t('storedReportNote')}</p>
    </>
  )
}
