import type { BoardMeta } from '@arrowz/engine'
import { genSeconds } from '@arrowz/engine/report'
import { type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { openEntry } from './openEntry'
import { useOpenBoard } from './useOpenBoard'

/**
 * The panel's face in the library: the rows of the chosen size, and Refresh.
 * A row is a button, because clicking it navigates — the address is the
 * selection (spec §5.6), so the browser's own back button walks the boards
 * that were looked at.
 *
 * Two empty states, and they say different things: an unreachable store asks
 * for `lab.sh`, an empty one asks for a board (Ruling 2). The row shows the
 * whole 71-character id, clipped by CSS, so it can be selected and copied.
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
  const { entry } = openEntry(sizes, open.size)

  const line = (meta: BoardMeta) => {
    const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString(lang === 'pl' ? 'pl' : 'en-GB') : ''
    const parts = [
      dict.t('piecesShort', meta.pieces ?? '?'),
      dict.t('longestShort', meta.maxLen ?? '?'),
      dict.t('genShort', genSeconds(meta, '—')),
      meta.source,
    ]
    return { when, text: parts.join(' · ') }
  }

  return (
    <section className="fw-lib-list" aria-label={dict.t('boardRows')}>
      <div className="fw-lib-head">
        <button type="button" onClick={refresh}>
          {dict.t('refresh')}
        </button>
      </div>
      {listError !== null ? <p className="fw-lib-empty">{dict.t('noStoreServer')}</p> : null}
      {listError === null && sizes !== null && entry === null ? (
        <p className="fw-lib-empty">{dict.t('storeEmpty')}</p>
      ) : null}
      {/*
        The rows hang off `entry` being there, rather than off an empty array
        standing in for it: inside the map `entry` was non-null by construction,
        so the `?? ''` its size once needed was unreachable — and had anything
        ever reached it, the row would have navigated to `/boards//<id>`. The
        repo's rule against a fallback that changes a value is exactly this.
      */}
      {entry === null
        ? null
        : entry.boards.map((meta) => {
            const { when, text } = line(meta)
            return (
              <button
                key={meta.id}
                type="button"
                className="fw-lib-row"
                {...(meta.id === open.id ? { 'aria-current': true } : {})}
                onClick={() => void navigate(`/boards/${entry.size}/${meta.id}`)}
              >
                <span className="id">{meta.id}</span>
                <span>{when}</span>
                <span className="meta">
                  {text}
                  {meta.ok === false ? ` · ${dict.t('notClosed')}` : ''}
                </span>
              </button>
            )
          })}
    </section>
  )
}
