import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { useLocation } from 'react-router'
import { useDictionary } from '../i18n'
import { TRIGGER_ID } from '../palette/CommandPalette'
import { useStore } from '../state/store'
import { Segmented } from './Segmented'
import { selectedIndex } from './TabRow'

/**
 * The one large Signal plane of the mock: the mark, the preset's name and the
 * size (spec §5.1), and the right group where the view and the language are
 * chosen.
 */
export function TopBar() {
  const dict = useDictionary()
  const mode = useStore((state) => state.ui.mode)
  const setMode = useStore((state) => state.ui.setMode)
  const lang = useStore((state) => state.lang.lang)
  const setLang = useStore((state) => state.lang.setLang)
  // "edited" only means something where a preset strip is on screen to be
  // edited from (`Workspace.tsx`: `lab && !simple`), and the bar is mounted
  // on every face — the saved boards, the docs, the simple view — where there
  // is none. `tabIndex === 0` is `Workspace`'s own "lab" test (`TabRow.tsx`'s
  // `selectedIndex`), read here rather than duplicated as a path check.
  const advancedLab = mode === 'advanced' && selectedIndex(useLocation().pathname) === 0
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
  // Off the advanced lab face, "no preset spells the knobs" is not "edited" —
  // there is no preset strip in sight for the knobs to have wandered away
  // from — so the slot prints nothing at all rather than a word that answers
  // a question nobody on this face is asking. The separator goes with it,
  // the way `.sep:has(+ .preset)` (shell.css) already drops it once its own
  // `.preset` is gone: this element is absent here for the same reason that
  // one is hidden there, and the bar's text never ends in a dangling "/".
  const showPreset = name !== null || advancedLab
  return (
    <header className="fw-top">
      <svg className="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 17 L10 3 L17 17 L10 13 Z" fill="currentColor" />
      </svg>
      <h1 className="name">Arrowz</h1>
      {showPreset ? (
        <>
          <span className="sep">/</span>
          <span className={name === null ? 'preset edited' : 'preset'}>{name ?? dict.t('presetsDirty')}</span>
        </>
      ) : null}
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
      <div className="right">
        <button
          type="button"
          id={TRIGGER_ID}
          aria-label={dict.t('cmdOpen')}
          // Toggles, like ⌘K itself: a button that only ever opened would be a
          // button that cannot close what it opened. The dialog's own
          // outside-press listener leaves this element alone for that reason.
          onClick={() => useStore.getState().ui.togglePalette()}
        >
          ⌘K
        </button>
        <Segmented
          label={dict.t('modeLabel')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'simple', label: dict.d.simple.viewSimple },
            { value: 'advanced', label: dict.d.simple.viewAdvanced },
          ]}
        />
        <Segmented
          label={dict.t('languageLabel')}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'pl', label: dict.t('langPl') },
            { value: 'en', label: dict.t('langEn') },
          ]}
        />
      </div>
    </header>
  )
}
