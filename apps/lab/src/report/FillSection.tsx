import type { Dict } from '@fronthub/arrowz-engine/i18n'
import type { ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDictionary } from '../i18n'
import type { FillError } from '../state/fill.slice'
import { useStore } from '../state/store'

function errorText(dict: Dict, error: FillError): string {
  if (error.kind === 'stale') return dict.t('fillStale')
  if (error.kind === 'store') return dict.t('fillStoreError', error.message)
  return dict.t('fillWorkerError', error.message === '' ? dict.t('workerError') : error.message)
}

/**
 * The last batch of saves: how many of the boards asked for it wrote and how
 * many seeds it tried, why it ended early if it did, and the seeds it skipped.
 * Neutral while it runs, as the Seeds section is.
 */
export function FillSection(): ReactElement | null {
  const dict = useDictionary()
  const fill = useStore(
    useShallow((state) => ({
      phase: state.fill.phase,
      params: state.fill.params,
      wanted: state.fill.wanted,
      limit: state.fill.limit,
      written: state.fill.written,
      tried: state.fill.tried,
      notComplete: state.fill.notComplete,
      alreadyStored: state.fill.alreadyStored,
      error: state.fill.error,
    })),
  )
  if (fill.params === null) return null
  const done = fill.phase === 'done'
  const tone = !done
    ? null
    : fill.written === fill.wanted && fill.error === null
      ? 'ok'
      : fill.written === 0
        ? 'error'
        : 'warn'
  const gaveUp = done && fill.error === null && fill.written < fill.wanted && fill.tried === fill.limit
  return (
    <section className="fw-fill-report" aria-label={dict.t('fillTitle')}>
      <h2>{dict.t('fillTitle')}</h2>
      {fill.error === null ? null : <p className="fw-series-head error">{errorText(dict, fill.error)}</p>}
      <p className={tone === null ? 'fw-series-head' : `fw-series-head ${tone}`}>
        {dict.t('fillHead', fill.written, fill.wanted, fill.tried)}
      </p>
      {gaveUp ? <p>{dict.t('fillGaveUp', fill.limit)}</p> : null}
      {fill.notComplete.length === 0 ? null : <p>{dict.t('fillNotComplete', fill.notComplete.join(', '))}</p>}
      {fill.alreadyStored.length === 0 ? null : <p>{dict.t('fillAlreadyStored', fill.alreadyStored.join(', '))}</p>}
    </section>
  )
}
