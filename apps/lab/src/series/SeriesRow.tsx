import type { CSSProperties, ReactElement } from 'react'
import { DraftNumber } from '../console/DraftNumber'
import { useDictionary } from '../i18n'
import { inFlight, type RunControl } from '../run/useRun'
import { useStore } from '../state/store'

/** Checks the knobs on screen over N seeds; while it runs, its button is the meter, as Generate is for a run. */
export function SeriesRow({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const count = useStore((state) => state.series.count)
  const setCount = useStore((state) => state.series.setCount)
  const checking = useStore((state) => state.series.phase === 'running')
  const done = useStore((state) => state.series.runs.length)
  const planned = useStore((state) => state.series.planned)
  const busy = useStore(inFlight)
  const blocked = useStore((state) => state.params.violations.length > 0)
  const share = planned === 0 ? 0 : (100 * done) / planned
  return (
    <div className="fw-alt fw-series">
      <button
        type="button"
        className={checking ? 'busy' : undefined}
        onClick={control.checkSeeds}
        disabled={busy || blocked}
        style={checking ? ({ '--p': `${share}%` } as CSSProperties) : undefined}
      >
        {checking ? dict.t('checkingSeeds', done, planned) : dict.t('checkSeeds')}
      </button>
      <DraftNumber entryId="series-count" label={dict.t('checkSeedsCount')} value={count} onCommit={setCount} />
    </div>
  )
}
