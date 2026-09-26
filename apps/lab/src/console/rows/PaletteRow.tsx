import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import { PALETTE_CAP } from '../../state/view.slice'
import { RowShell, rowIds } from './RowShell'

/**
 * The editable custom palette as a row: its count against the cap in the value
 * track, its colours and the add button across the minimum's and the
 * control's tracks. The cap lives in the schema's palette reader (`VIEW_SCHEMA.palette`),
 * so nothing here can bypass it.
 */
export function PaletteRow(): ReactElement {
  const dict = useDictionary()
  const palette = useStore((state) => state.view.palette)
  const addPaletteColor = useStore((state) => state.view.addPaletteColor)
  const setPaletteColor = useStore((state) => state.view.setPaletteColor)
  const removePaletteColor = useStore((state) => state.view.removePaletteColor)
  const ids = rowIds('view-palette')
  return (
    <RowShell
      id="view-palette"
      name={dict.t('viewShortPalette')}
      helpText={dict.t('paletteHelp', PALETTE_CAP)}
      labelAs="span"
      title={dict.t('paletteLabel')}
      wide
      value={<span className="kv-unit">{dict.t('paletteCount', palette.length, PALETTE_CAP)}</span>}
      control={
        <span className="kv-colour">
          {palette.length === 0 ? null : (
            <ul className="fw-palette-list" aria-labelledby={ids.label}>
              {palette.map((color, index) => (
                // No stable id per colour — a value can repeat, and only its
                // position in the list is unique.
                <li key={index} className="fw-palette-row">
                  <label className="fw-vh" htmlFor={`view-palette-${index}`}>
                    {dict.t('paletteColorLabel', index + 1)}
                  </label>
                  <input
                    id={`view-palette-${index}`}
                    type="color"
                    value={color}
                    onChange={(e) => setPaletteColor(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="fw-palette-remove"
                    aria-label={dict.t('paletteRemove', index + 1)}
                    onClick={() => removePaletteColor(index)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* `disabled` alone leaves a screen reader saying only "add colour,
              dimmed" at the cap; the description states the cap in words,
              so the refusal is audible too. */}
          <button
            type="button"
            className="kv-chip"
            onClick={addPaletteColor}
            disabled={palette.length >= PALETTE_CAP}
            aria-describedby={ids.help}
          >
            {dict.t('paletteAdd')}
          </button>
        </span>
      }
    />
  )
}
