import { DEFAULT_VIEW } from '@fronthub/arrowz-board'
import type { ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import { ColourRow } from './ColourRow'
import { PaletteRow } from './PaletteRow'
import { Section } from './Section'
import { ThemeRow } from './ThemeRow'

/**
 * The colours the stage paints any board with: the lab's own, and on the saved
 * boards the stored board's too — `BoardFrame` spreads the theme, the palette,
 * the paper and the ink over a stored board's view. So this
 * section belongs to both faces, and it is always the lab's slice it edits.
 */
export function ColoursSection(): ReactElement {
  const dict = useDictionary()
  const view = useStore(
    useShallow((state) => ({
      paper: state.view.paper,
      ink: state.view.ink,
      highlightColor: state.view.highlightColor,
      setPaper: state.view.setPaper,
      setInk: state.view.setInk,
      setHighlightColor: state.view.setHighlightColor,
    })),
  )
  return (
    <Section id="view-sec-colours" title={dict.t('previewColours')}>
      <ThemeRow />
      {/* The board's own surface colours: `''` means "not set", which a
          colour input cannot show, so the row shows the element's own
          default while unset, and the clear button — present only once
          there is something to clear — hands the field back to a theme. */}
      <ColourRow
        id="view-paper"
        short={dict.t('viewShortPaper')}
        help={dict.t('paperHelp')}
        title={dict.t('paperLabel')}
        value={view.paper === '' ? DEFAULT_VIEW.paper : view.paper}
        onChange={view.setPaper}
        {...(view.paper === '' ? {} : { onClear: () => view.setPaper(''), clearLabel: dict.t('paperClear') })}
      />
      <ColourRow
        id="view-ink"
        short={dict.t('viewShortInk')}
        help={dict.t('inkHelp')}
        title={dict.t('inkLabel')}
        value={view.ink === '' ? DEFAULT_VIEW.ink : view.ink}
        onChange={view.setInk}
        {...(view.ink === '' ? {} : { onClear: () => view.setInk(''), clearLabel: dict.t('inkClear') })}
      />
      <ColourRow
        id="view-highlightColor"
        short={dict.t('viewShortHighlightColor')}
        help={dict.t('highlightColorHelp')}
        title={dict.t('highlightColorLabel')}
        value={view.highlightColor === '' ? DEFAULT_VIEW.highlight : view.highlightColor}
        onChange={view.setHighlightColor}
        {...(view.highlightColor === ''
          ? {}
          : { onClear: () => view.setHighlightColor(''), clearLabel: dict.t('highlightColorClear') })}
      />
      <PaletteRow />
    </Section>
  )
}
