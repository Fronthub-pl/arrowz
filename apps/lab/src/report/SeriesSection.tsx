import { summariseSeries, type SeriesSummary } from '@arrowz/engine/report'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { StatRowView } from './StatRowView'

const OUTCOME = {
  incomplete: 'seriesOutcome_incomplete',
  unsolvable: 'seriesOutcome_unsolvable',
  stopped: 'seriesOutcome_stopped',
} as const

/** An error never reads as a clean pass, whatever share of the seeds answered before it. */
function toneOf(s: SeriesSummary, error: string | null): 'ok' | 'warn' | 'error' {
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
  const series = useStore((state) => state.series)
  const values = useStore((state) => state.params.values)
  if (series.params === null || (series.runs.length === 0 && series.error === null)) return null
  const own = series.params
  const s = series.runs.length === 0 ? null : summariseSeries(series.runs)
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
          <p className={`fw-series-head ${toneOf(s, series.error)}`}>
            {dict.t('seriesHead', s.total, s.complete, s.incomplete, s.unsolvable, s.stopped)}
          </p>
          <table className="fw-stats">
            <tbody>
              {(
                [
                  ['series-arrows', dict.t('seriesMeanArrows'), s.meanPieces],
                  ['series-longest', dict.t('seriesMeanLongest'), s.meanMaxLen],
                  ['series-time', dict.t('seriesMeanTime'), s.meanGenMs === null ? null : s.meanGenMs / 1000],
                ] as [string, string, number | null][]
              ).map(([id, label, value]) => (
                <StatRowView
                  key={id}
                  id={id}
                  label={label}
                  value={value === null ? '—' : dict.fmt(Math.round(value * 10) / 10)}
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
