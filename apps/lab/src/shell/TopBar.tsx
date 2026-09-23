import { useDictionary } from '../i18n'
import { TRIGGER_ID } from '../palette/CommandPalette'
import { useStore } from '../state/store'
import { Segmented } from './Segmented'

/**
 * The one large Signal plane of the mock: the mark and the size (spec §5.1;
 * the preset's name moved to the picker, spec §3.3), and the right group
 * where the view and the language are chosen.
 */
export function TopBar() {
  const dict = useDictionary()
  const mode = useStore((state) => state.ui.mode)
  const setMode = useStore((state) => state.ui.setMode)
  const lang = useStore((state) => state.lang.lang)
  const setLang = useStore((state) => state.lang.setLang)
  const W = useStore((state) => state.params.values.W)
  const H = useStore((state) => state.params.values.H)
  return (
    <header className="fw-top">
      <svg className="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 17 L10 3 L17 17 L10 13 Z" fill="currentColor" />
      </svg>
      <h1 className="name">Arrowz</h1>
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
