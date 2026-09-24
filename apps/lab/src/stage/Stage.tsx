import { type ReactElement, type ReactNode, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { REPORT_ID, ReportPanel } from '../report/ReportPanel'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'

/** The console inside the settings drawer, which the drawer's handle controls. */
export const SETTINGS_ID = 'settings-panel'

/**
 * A focus inside a drawer that is closing would fall to <body> once the drawer
 * turns hidden; it moves to the handle, which is how the drawer comes back
 * (the pattern `BoardFrame` uses for solo).
 */
function useFocusBackToHandle(open: boolean, panelId: string) {
  const handle = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const button = handle.current
    if (open || button === null) return
    const panel = document.getElementById(panelId)
    const active = document.activeElement
    if (panel !== null && active !== null && panel.contains(active)) button.focus()
  }, [open, panelId])
  return handle
}

/**
 * Four tracks on both tabs: the settings drawer's handle, the board, the right
 * column and the report's handle. Both drawers are toggled by their class,
 * never remounted, or the slide would not animate; closed, their contents are
 * `visibility: hidden`. The settings drawer does not cover the board: open, it
 * adds `ls-open`, which pads the board's track by the drawer's width, so a knob
 * change is always in sight.
 *
 * The right column is the run column on the lab and the open board's column
 * (`side`) on the saved boards. The run column stays mounted on both, hidden by
 * class on the saved boards, so a carve in flight keeps its node and refs;
 * `side` holds its slot as `null` on the lab. Nothing before `BoardFrame` ever
 * changes type, so it keeps its node, which keeps `<arrowz-board>`'s GL
 * context alive across the tabs.
 */
export function Stage({
  settings,
  run,
  side,
  busy = false,
}: {
  settings: ReactNode
  run: ReactNode
  side: ReactNode
  /** A carve in flight on the lab: the board is about to change. */
  busy?: boolean
}): ReactElement {
  const dict = useDictionary()
  const reportOpen = useStore((state) => state.ui.report)
  const toggleReport = useStore((state) => state.ui.toggleReport)
  const settingsOpen = useStore((state) => state.ui.settings)
  const toggleSettings = useStore((state) => state.ui.toggleSettings)
  const reportHandle = useFocusBackToHandle(reportOpen, REPORT_ID)
  const settingsHandle = useFocusBackToHandle(settingsOpen, SETTINGS_ID)

  return (
    <div className={settingsOpen ? 'fw-stage ls-open' : 'fw-stage'} aria-busy={busy ? true : undefined}>
      <div className={settingsOpen ? 'fw-ldrawer open' : 'fw-ldrawer'}>
        {settings}
        <button
          ref={settingsHandle}
          type="button"
          className="fw-drawer-handle"
          aria-expanded={settingsOpen}
          aria-controls={SETTINGS_ID}
          aria-keyshortcuts="S"
          onClick={toggleSettings}
        >
          <span className="t">{dict.t('settingsHandle')}</span>
          <span className="c" aria-hidden="true">
            {settingsOpen ? '◀' : '▶'}
          </span>
        </button>
      </div>
      <BoardFrame />
      {run}
      {side}
      <div className={reportOpen ? 'fw-drawer open' : 'fw-drawer'}>
        <button
          ref={reportHandle}
          type="button"
          className="fw-drawer-handle"
          aria-expanded={reportOpen}
          aria-controls={REPORT_ID}
          aria-keyshortcuts="R"
          onClick={toggleReport}
        >
          <span className="t">{dict.t('reportHandle')}</span>
          <span className="c" aria-hidden="true">
            {reportOpen ? '▶' : '◀'}
          </span>
        </button>
        <ReportPanel />
      </div>
    </div>
  )
}
