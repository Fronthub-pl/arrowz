import type { CSSProperties, ReactElement } from 'react'
import { DraftNumber } from '../console/DraftNumber'
import { useDictionary } from '../i18n'
import { inFlight, type RunControl } from '../run/useRun'
import { useStore } from '../state/store'

/** Saves many complete boards over the seeds; while it runs, its button is the meter, as Check seeds is. */
export function FillRow({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const count = useStore((state) => state.fill.count)
  const maxSeeds = useStore((state) => state.fill.maxSeeds)
  const setCount = useStore((state) => state.fill.setCount)
  const setMaxSeeds = useStore((state) => state.fill.setMaxSeeds)
  const filling = useStore((state) => state.fill.phase === 'running')
  const written = useStore((state) => state.fill.written)
  const wanted = useStore((state) => state.fill.wanted)
  const busy = useStore(inFlight)
  const blocked = useStore((state) => state.params.violations.length > 0)
  const share = wanted === 0 ? 0 : (100 * written) / wanted
  return (
    <div className="fw-alt fw-fill">
      <button
        type="button"
        className={filling ? 'busy' : undefined}
        onClick={control.fillLibrary}
        disabled={busy || blocked}
        style={filling ? ({ '--p': `${share}%` } as CSSProperties) : undefined}
      >
        {filling ? dict.t('fillingLibrary', written, wanted) : dict.t('fillLibrary')}
      </button>
      {/* For the eye only: each number's own name carries its word. */}
      <span className="fw-fill-lab" aria-hidden="true">
        {dict.t('fillCount')}
      </span>
      <DraftNumber entryId="fill-count" label={dict.t('fillCount')} value={count} onCommit={setCount} />
      <span className="fw-fill-lab" aria-hidden="true">
        {dict.t('fillMaxSeeds')}
      </span>
      <DraftNumber
        entryId="fill-max-seeds"
        label={dict.t('fillMaxSeeds')}
        value={maxSeeds ?? 2 * count}
        onCommit={setMaxSeeds}
      />
    </div>
  )
}
