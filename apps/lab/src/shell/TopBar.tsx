import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * The one large Signal plane of the mock: the mark, the preset's name and the
 * size (spec §5.1). The preset only becomes knowable in this PR, which is why
 * the name arrives with the strip.
 */
export function TopBar() {
  const dict = useDictionary()
  // One selector on the whole `values` object, and no longer two primitive
  // ones: the bar names the preset as well as the size, and the presets are
  // spelled between them by six knobs — W, H, headBias, giants, giantStep and
  // giantJitter — not by two. `findPreset` walks twenty-six options.
  const values = useStore((state) => state.params.values)
  const W = values.W
  const H = values.H
  const preset = findPreset(values)
  // The level that *contains* the option, not the first segment of its id:
  // `PRESETS` nests the options under their level already, so the containing
  // level is exact, and a level id with a hyphen of its own (`very-hard`)
  // cannot cut the name down to its mode. `findPreset` returns the very object
  // the table holds, so identity is the right test.
  const level = preset === null ? undefined : PRESETS.find((entry) => entry.options.includes(preset))
  // Same narrowing as `PresetStrip`: a level id is a plain string, the
  // dictionary's `levels` a fixed-key object.
  const levels = dict.d.presets.levels as Partial<Record<string, string>>
  const name =
    preset === null || level === undefined
      ? null
      : `${levels[level.id] ?? level.id} ${dict.d.presets.modes[preset.mode]}`
  return (
    <header className="fw-top">
      <svg className="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 17 L10 3 L17 17 L10 13 Z" fill="currentColor" />
      </svg>
      <span className="name">Arrowz</span>
      {name === null ? null : (
        <>
          <span className="sep">/</span>
          <span className="preset">{name}</span>
        </>
      )}
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
      {/* The right group is where ⌘K (still to come), the language switch
          and the simple/advanced switch (PR 4) go. It stays empty rather
          than carrying a placeholder nobody would remember to remove. */}
      <div className="right" />
    </header>
  )
}
