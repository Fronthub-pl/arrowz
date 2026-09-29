import { type ReactNode, useRef } from 'react'
import { useDictionary } from '../i18n'
import { TRIGGER_ID } from '../palette/CommandPalette'
import { useStore } from '../state/store'
import { Segmented } from './Segmented'
import { useDismiss } from './useDismiss'

export const TOP_MENU_ID = 'top-menu'

/**
 * The one large Signal plane of the mock: the mark and the size (the preset's
 * name is on the picker), and the right group where the view and the language
 * are chosen.
 */
export function TopBar({ presets }: { presets: ReactNode }) {
  const dict = useDictionary()
  const mode = useStore((state) => state.ui.mode)
  const setMode = useStore((state) => state.ui.setMode)
  const lang = useStore((state) => state.lang.lang)
  const setLang = useStore((state) => state.lang.setLang)
  const W = useStore((state) => state.params.values.W)
  const H = useStore((state) => state.params.values.H)
  const menu = useStore((state) => state.ui.menu)
  const setMenu = useStore((state) => state.ui.setMenu)
  const toggleMenu = useStore((state) => state.ui.toggleMenu)
  const bar = useRef<HTMLElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  // The whole bar counts as inside: the chip toggles the menu itself.
  useDismiss({ open: menu, inside: [bar], onClose: () => setMenu(false), refocus: chip })
  return (
    <header className="fw-top" ref={bar}>
      <svg className="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 17 L10 3 L17 17 L10 13 Z" fill="currentColor" />
      </svg>
      <h1 className="name">Arrowz</h1>
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
      {presets}
      {/* XS only (shell.css): the right group folds into this menu. */}
      <button
        ref={chip}
        type="button"
        className="fw-menu-btn"
        aria-expanded={menu}
        aria-controls={TOP_MENU_ID}
        onClick={toggleMenu}
      >
        {dict.t('menu')}
        <span aria-hidden="true">{menu ? '▲' : '▼'}</span>
      </button>
      <div className="right" id={TOP_MENU_ID}>
        <button
          type="button"
          id={TRIGGER_ID}
          aria-label={dict.t('cmdOpen')}
          // Toggles, like ⌘K itself. While the palette is open its scrim covers
          // this button, so a press here lands on the scrim and closes it.
          onClick={() => {
            const ui = useStore.getState().ui
            ui.setMenu(false)
            ui.togglePalette()
          }}
        >
          <span className="k-key">⌘K</span>
          <span className="k-touch">{dict.t('cmdTouch')}</span>
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
