import { THEMES, themeOf } from '@arrowz/board-element'
import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import { RowShell, rowIds } from './RowShell'

/**
 * The chosen theme's arrow colours, in order, on the theme's own paper, so a
 * colour that would vanish against that paper shows it. Renders nothing for
 * `''` (no theme). `aria-hidden`: the `<select>` beside it already names the
 * theme, and a hex value read out names nothing anyone would ask for.
 */
function ThemeSwatchStrip({ themeName }: { themeName: string }) {
  const theme = themeOf(themeName)
  if (!theme) return null
  return (
    <div className="fw-swatches" aria-hidden="true" style={{ backgroundColor: theme.paper }}>
      {theme.palette.map((color, index) => (
        // The palette can repeat a colour or, for the two single-arrow
        // themes, hold just one: the index is the only stable key a static,
        // never-reordered array offers.
        <span key={index} className="fw-swatch" style={{ backgroundColor: color }} />
      ))}
    </div>
  )
}

/**
 * The theme as a row: the select in the control track, the chosen theme's
 * strip under it. The simple view's preview section shows it too.
 */
export function ThemeRow(): ReactElement {
  const dict = useDictionary()
  const theme = useStore((state) => state.view.theme)
  const setTheme = useStore((state) => state.view.setTheme)
  return (
    <RowShell
      id="view-theme"
      name={dict.t('viewShortTheme')}
      helpText={dict.t('themeHelp')}
      labelAs="for"
      title={dict.t('themeLabel')}
      control={
        <select
          id="view-theme"
          value={theme}
          aria-describedby={rowIds('view-theme').help}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="">{dict.t('viewThemeNone')}</option>
          {Object.keys(THEMES).map((themeName) => (
            <option key={themeName} value={themeName}>
              {themeName}
            </option>
          ))}
        </select>
      }
      after={<ThemeSwatchStrip themeName={theme} />}
    />
  )
}
