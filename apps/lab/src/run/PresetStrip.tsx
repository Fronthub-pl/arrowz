import type { Params } from '@arrowz/engine'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { Fragment } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { applyPreset } from './actions'
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
  const current = findPreset(values)
  // `PresetLevel.id` is a `string` and the dictionary's `levels` is a
  // fixed-key object, so the index needs narrowing — the same shape
  // `KnobPanel.tsx:24` uses for `groupHelp`.
  const levels = dict.d.presets.levels as Partial<Record<string, string>>

  // The chip and the palette row are the same action (spec D6): `applyPreset`
  // in `./actions` writes every knob, follows it with the export cell size,
  // and starts the run.
  const apply = (params: Partial<Params>) => applyPreset(control, params)

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
    </div>
  )
}
