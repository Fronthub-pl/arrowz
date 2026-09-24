import { type BoardData, longestSummary } from '@arrowz/engine'
import { pct } from '@arrowz/engine/report'
import { type ReactElement, useMemo } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * The longest pieces of the board on screen. The count is the highlight's own
 * — `viewOf` folds the flag into `top` — so turning the highlight off leaves
 * nothing to list. Memoised on the board and the count: `longestSummary` sorts
 * every piece, about 90 000 at Insane, and a preview field edit re-renders this.
 *
 * A stored board has no highlight to fold, so the saved boards pass `stored`
 * and list the lab's count whatever its switch says.
 */
export function LongestTable({ board, stored = false }: { board: BoardData; stored?: boolean }): ReactElement | null {
  const dict = useDictionary()
  const top = useStore((state) => (stored || state.view.highlightLongest ? state.view.top : 0))
  const longest = useMemo(() => longestSummary(board, top), [board, top])
  if (longest.length === 0) return null
  return (
    <>
      <h2 id="longest-head">{dict.t('longestHead', longest.length)}</h2>
      <p>{dict.t('longestHelp')}</p>
      <table className="fw-longest" aria-labelledby="longest-head">
        <thead>
          <tr>
            <th scope="col">{dict.t('th_len')}</th>
            <th scope="col">{dict.t('th_box')}</th>
            <th scope="col">{dict.t('th_span')}</th>
            <th scope="col">{dict.t('th_density')}</th>
            <th scope="col">{dict.t('th_coil')}</th>
          </tr>
        </thead>
        <tbody>
          {longest.map((piece, at) => (
            <tr key={at}>
              <td className="num">{piece.len}</td>
              <td className="num">{`${piece.sx}×${piece.sy}`}</td>
              <td className="num">{pct(piece.span)}</td>
              <td className="num">{pct(piece.density)}</td>
              <td className="num">{pct(piece.coil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
