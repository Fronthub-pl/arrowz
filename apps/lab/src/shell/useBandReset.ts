import { useEffect, useRef } from 'react'
import { narrow } from '../state/band'
import { useStore } from '../state/store'
import { useBand, useLowWindow } from './useLayoutBand'

/**
 * A band change closes the sheet and the menu (they belong to the band they
 * were opened in) and, going below 1024px, the settings drawer, which would lie
 * over the board: closed without being remembered, restored on the way up.
 * Compared with the last band seen, not skipped on a first run: StrictMode's
 * second pass would read as a change.
 */
export function useBandReset() {
  const band = useBand()
  const low = useLowWindow()
  const seen = useRef({ band, low })
  useEffect(() => {
    const was = seen.current
    if (was.band === band && was.low === low) return
    seen.current = { band, low }
    const ui = useStore.getState().ui
    ui.setSheet(null)
    ui.setMenu(false)
    if (narrow(band) && !narrow(was.band)) ui.closeSettingsForNarrow()
    else if (!narrow(band) && narrow(was.band)) ui.restoreSettings()
  }, [band, low])
}
