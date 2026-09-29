import { summariseSeries } from '@arrowz/engine/report'
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

/**
 * The last series: its outcome counts, the means of its complete seeds and a
 * button per seed that was not complete. A button loads the series' own knobs
 * with that seed and runs them, so the stage shows the very board that failed.
 */
export function SeriesSection({ control }: { control: RunControl }): ReactElement | null {
  const dict = useDictionary()
  const series = useStore((state) => state.series)
  const values = useStore((state) => state.params.values)
  if (series.params === null || series.runs.length === 0) return null
  const own = series.params
  const s = summariseSeries(series.runs)
  const stale = (Object.keys(own) as (keyof typeof own)[]).some((key) => key !== 'seed' && own[key] !== values[key])
  const tone = s.complete === s.total ? 'ok' : s.complete === 0 ? 'error' : 'warn'
  const open = (seed: number) => {
    useStore.getState().params.setMany({ ...own, seed })
    control.start()
  }
  const means: [string, string, number | null][] = [
    ['series-arrows', dict.t('seriesMeanArrows'), s.meanPieces],
    ['series-longest', dict.t('seriesMeanLongest'), s.meanMaxLen],
    ['series-time', dict.t('seriesMeanTime'), s.meanGenMs === null ? null : s.meanGenMs / 1000],
  ]
  return (
    <section className="fw-series-report" aria-label={dict.t('seriesTitle')}>
      <h2>
        {dict.t('seriesTitle')}
        {stale ? <span className="kv-unit"> · {dict.t('seriesStale')}</span> : null}
      </h2>
      <p className={`fw-series-head ${tone}`}>
        {dict.t('seriesHead', s.total, s.complete, s.incomplete, s.unsolvable, s.stopped)}
      </p>
      <table className="fw-stats">
        <tbody>
          {means.map(([id, label, value]) => (
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
              <button type="button" onClick={() => open(run.seed)}>
                {run.outcome === 'complete'
                  ? null
                  : dict.t('seriesFailed', run.seed, dict.t(OUTCOME[run.outcome]), run.remaining)}
              </button>
            </li>
          ))}
      </ul>
    </section>
  )
}
