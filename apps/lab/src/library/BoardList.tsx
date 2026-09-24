import type { BoardMeta } from '@arrowz/engine'
import { type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { BOARDS_LIST_ID, boardsTabId, sizeName } from './BoardsRail'
import { openEntry } from './openEntry'
import { useOpenBoard } from './useOpenBoard'

/**
 * A layout id as a row prints it: the first eight and the last four digits of
 * the hash, without the `sha256-` it always opens with. The whole id stays in
 * the row's `title`, and in the right column's facts.
 */
export function shortId(id: string): string {
  const hex = id.slice(id.indexOf('-') + 1)
  return hex.length > 12 ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : hex
}

/**
 * The drawer's list panel on the saved boards: a header — the size, how many
 * boards it holds, Refresh — and the boards of that size as ruled rows. A row
 * is a button, because clicking it navigates: the address is the selection,
 * so the browser's back button walks the boards looked at. An unreachable
 * store asks for `store.sh`; an empty one asks for a board.
 */
export function BoardList({ refresh }: { refresh(): void }): ReactElement {
  const dict = useDictionary()
  const sizes = useStore((state) => state.library.sizes)
  const listError = useStore((state) => state.library.listError)
  const lang = useStore((state) => state.lang.lang)
  const open = useOpenBoard()
  const navigate = useNavigate()

  // The size the address names, or the first the store listed: entering the
  // tab without an address still has rows to show.
  const { entry, mismatch } = openEntry(sizes, open.size)

  const when = (meta: BoardMeta) =>
    meta.createdAt
      ? new Date(meta.createdAt).toLocaleString(lang === 'pl' ? 'pl' : 'en-GB', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''

  return (
    <div
      className="fw-knobs fw-blist"
      role="tabpanel"
      id={BOARDS_LIST_ID}
      // Named by its tab when one is selected; a size the store has not got
      // selects none, and the panel still needs a name.
      {...(entry === null || mismatch
        ? { 'aria-label': dict.t('boardRows') }
        : { 'aria-labelledby': boardsTabId(entry.size) })}
    >
      <div className="fw-khd fw-blist-hd">
        <b>{entry === null ? dict.t('tabLibrary') : sizeName(entry.size)}</b>
        <span className="kv-unit">{entry === null ? '' : dict.t('boardsCount', entry.boards.length)}</span>
        <button type="button" className="kv-chip" onClick={refresh}>
          {dict.t('refresh')}
        </button>
      </div>
      {listError !== null ? <p className="fw-lib-empty">{dict.t('noStoreServer')}</p> : null}
      {listError === null && sizes !== null && entry === null ? (
        <p className="fw-lib-empty">{dict.t('storeEmpty')}</p>
      ) : null}
      {/*
        The rows hang off `entry` being there, rather than off an empty array
        standing in for it: inside the map `entry` is non-null by construction,
        so no fallback size could ever send a row to `/boards//<id>`.
      */}
      {entry === null ? null : (
        <div className="fw-blist-rows">
          {entry.boards.map((meta) => (
            <button
              key={meta.id}
              type="button"
              className="fw-lib-row fw-brow"
              title={meta.id}
              {...(meta.id === open.id ? { 'aria-current': true } : {})}
              onClick={() => {
                // On a phone this list is a sheet over the board, which a
                // picked board must not hide; elsewhere no sheet is open.
                useStore.getState().ui.setSheet(null)
                void navigate(`/boards/${entry.size}/${meta.id}`)
              }}
            >
              <span className="id">{shortId(meta.id)}</span>
              <span className="when">{when(meta)}</span>
              <span className="meta">
                {`${dict.t('piecesShort', meta.pieces ?? '?')} · ${dict.t('longestShort', meta.maxLen ?? '?')}`}
              </span>
              {meta.ok === false ? (
                <span className="src bad">{dict.t('notClosed')}</span>
              ) : (
                <span className="src">{meta.source}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
