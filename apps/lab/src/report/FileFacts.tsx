import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { OpenedFile } from '../state/result.slice'
import { StoredFacts } from './StoredFacts'

/**
 * The report of a board opened from disk: what the file itself says, and the
 * store's facts when its meta came along. No run rows: nothing ran here.
 */
export function FileFacts({ opened }: { opened: OpenedFile }): ReactElement {
  const dict = useDictionary()
  const { board, file, meta, name } = opened
  const rows: [string, string][] = [
    [dict.t('factFile'), name],
    [dict.t('stat_board'), dict.t('boardSize', board.W, board.H)],
    [dict.t('stat_pieces'), dict.fmt(board.pieces.length)],
  ]
  if (file.unfilled > 0) rows.push([dict.t('factEmpty'), dict.fmt(file.unfilled)])
  return (
    <>
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd className="wrap-text">{value}</dd>
          </div>
        ))}
      </dl>
      {meta === null ? <p>{dict.t('fileNoMeta')}</p> : <StoredFacts meta={meta} />}
    </>
  )
}
