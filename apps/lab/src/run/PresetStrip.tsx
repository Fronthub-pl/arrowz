import { PARAM_SPEC, type Params } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { Fragment } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'

/**
 * Seven levels, twenty-six options, one scrolling strip (Ruling 8). A chip's
 * visible label is its mode alone, because `25×50 · square` twenty-six times
 * over is unreadable; the level name is a flat sibling span, hidden from the
 * accessibility tree exactly as `GroupRail.tsx:89-91` hides its two section
 * headings, and each chip's `aria-label` carries level, size and mode.
 */
export function PresetStrip({ control }: { control: RunControl }) {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const setMany = useStore((state) => state.params.setMany)
  const setNumber = useStore((state) => state.view.setNumber)
  const raiseClamped = useStore((state) => state.ui.raiseClamped)
  const current = findPreset(values)
  // `PresetLevel.id` is a `string` and the dictionary's `levels` is a
  // fixed-key object, so the index needs narrowing — the same shape
  // `KnobPanel.tsx:24` uses for `groupHelp`.
  const levels = dict.d.presets.levels as Partial<Record<string, string>>

  const apply = (params: Partial<Params>) => {
    // Every knob, not only the ones the preset names: `lab-presets.ts` calls
    // an option "engine defaults + these overrides, so choosing one never
    // inherits knobs left over from the previous experiment". Seed included,
    // which is why two presets cannot be compared on one seed (Ruling 10).
    const full: Partial<Params> = {}
    for (const spec of PARAM_SPEC) full[spec.key] = params[spec.key] ?? spec.def
    // A preset is written for the engine's envelope, not for this board's, so
    // a value can arrive out of range and be pulled in. The notice is how the
    // move stops being silent (spec §5.3).
    raiseClamped(setMany(full))
    // §2.2 row 2: the export cell size follows the preset's size, as the old
    // lab does at `lab-page.ts:491`. It is a view field, so it goes through
    // the view slice's tolerant reader rather than into the knobs.
    const W = params.W ?? 0
    const H = params.H ?? 0
    setNumber('cell', String(exportCell(W, H)))
    control.start()
  }

  return (
    <div className="fw-presets" role="group" aria-label={dict.t('presetsLabel')}>
      {PRESETS.map((level) => {
        const levelName = levels[level.id] ?? level.id
        return (
          <Fragment key={level.id}>
            <span className="lbl caps" aria-hidden="true">
              {levelName}
            </span>
            {level.options.map((option) => {
              const W = option.params.W ?? 0
              const H = option.params.H ?? 0
              const mode = dict.d.presets.modes[option.mode]
              return (
                <button
                  key={option.id}
                  type="button"
                  {...(current?.id === option.id ? { 'aria-current': true } : {})}
                  aria-label={`${levelName} ${W}×${H} ${mode}`}
                  onClick={() => apply(option.params)}
                >
                  {mode}
                </button>
              )
            })}
          </Fragment>
        )
      })}
      {current === null ? <span className="dirty">{dict.t('presetsDirty')}</span> : null}
    </div>
  )
}
