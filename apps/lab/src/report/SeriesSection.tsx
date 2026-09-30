import { summariseSeries, type SeriesSummary } from '@arrowz/engine/report'
import type { ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDictionary } from '../i18n'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { StatRowView } from './StatRowView'

const OUTCOME = {
  incomplete: 'seriesOutcome_incomplete',
  unsolvable: 'seriesOutcome_unsolvable',
  stopped: 'seriesOutcome_stopped',
} as const

/**
 * Neutral until the series is done: a good tone mid-series would call seeds
 * still to come complete. An error never reads as a clean pass either.
 */
function toneOf(s: SeriesSummary, error: string | null, done: boolean): 'ok' | 'warn' | 'error' | null {
  if (!done) return null
  if (error !== null) return s.complete === 0 ? 'error' : 'warn'
  return s.complete === s.total ? 'ok' : s.complete === 0 ? 'error' : 'warn'
}

/**
 * The last series: its outcome counts, the means of its complete seeds and a
 * button per seed that was not complete. A button loads the series' own knobs
 * with that seed and runs them, so the stage shows the very board that failed.
 * A worker crash is told too, even with no answer yet to count.
 */
export function SeriesSection({ control }: { control: RunControl }): ReactElement | null {
  const dict = useDictionary()
  const series = useStore(
    useShallow((state) => ({
      params: state.series.params,
      runs: state.series.runs,
      error: state.series.error,
      phase: state.series.phase,
    })),
  )
  const values = useStore((state) => state.params.values)
  if (series.params === null || (series.runs.length === 0 && series.error === null)) return null
  const own = series.params
  const s = series.runs.length === 0 ? null : summariseSeries(series.runs)
  const tone = s === null ? null : toneOf(s, series.error, series.phase === 'done')
  const stale = (Object.keys(own) as (keyof typeof own)[]).some((key) => key !== 'seed' && own[key] !== values[key])
  const open = (seed: number) => {
    if (series.phase === 'running') return
    useStore.getState().params.setMany({ ...own, seed })
    control.start()
  }
  return (
    <section className="fw-series-report" aria-label={dict.t('seriesTitle')}>
      <h2>
        {dict.t('seriesTitle')}
        {stale ? <span className="kv-unit"> · {dict.t('seriesStale')}</span> : null}
      </h2>
      {series.error !== null ? (
        <p className="fw-series-head error">
          {dict.t('seriesError', series.error === '' ? dict.t('workerError') : series.error)}
        </p>
      ) : null}
      {s !== null ? (
        <>
          <p className={tone === null ? 'fw-series-head' : `fw-series-head ${tone}`}>
            {dict.t('seriesHead', s.total, s.complete, s.incomplete, s.unsolvable, s.stopped)}
          </p>
          <table className="fw-stats">
            <tbody>
              {(
                [
                  ['series-arrows', dict.t('seriesMeanArrows'), s.meanPieces, false],
                  ['series-longest', dict.t('seriesMeanLongest'), s.meanMaxLen, false],
                  ['series-time', dict.t('seriesMeanTime'), s.meanGenMs === null ? null : s.meanGenMs / 1000, true],
                ] as [string, string, number | null, boolean][]
              ).map(([id, label, value, seconds]) => (
                <StatRowView
                  key={id}
                  id={id}
                  label={label}
                  value={
                    value === null
                      ? '—'
                      : seconds
                        ? dict.t('statSumSeconds', dict.fmt(Math.round(value * 10) / 10))
                        : dict.fmt(Math.round(value * 10) / 10)
                  }
                  help={dict.t('seriesMean_help')}
                  className={undefined}
                  delta={<td className="fw-delta" />}
                />
              ))}
            </tbody>
          </table>
          <ul className="fw-series-failed">
            {series.runs
              .filter((run) => run.outcome !== 'complete')
              .map((run) => (
                <li key={run.seed}>
                  <button type="button" disabled={series.phase === 'running'} onClick={() => open(run.seed)}>
                    {run.outcome === 'complete'
                      ? null
                      : run.outcome === 'unsolvable'
                        ? dict.t('seriesFailedUnsolvable', run.seed)
                        : dict.t('seriesFailed', run.seed, dict.t(OUTCOME[run.outcome]), run.remaining)}
                  </button>
                </li>
              ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
