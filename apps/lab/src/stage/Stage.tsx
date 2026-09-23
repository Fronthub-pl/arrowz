import { type ReactElement, type ReactNode, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { REPORT_ID, ReportPanel } from '../report/ReportPanel'
import type { WorkspaceTab } from '../routes/Workspace'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'

/** The console inside the settings drawer, which the drawer's handle controls. */
export const SETTINGS_ID = 'settings-panel'

/**
 * A focus inside a drawer that is closing would fall to <body> once the drawer
 * turns hidden; it moves to the handle, which is how the drawer comes back —
 * the pattern BoardFrame.tsx uses for solo.
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
 * Four tracks on the lab (handoff 2, PR 1): the settings drawer's handle, the
 * board, the run column and the report's handle. Both drawers are toggled by
 * their class, never remounted, or the slide would not animate; closed, their
 * contents are `visibility: hidden` (shell.css). The settings drawer does not
 * cover the board: open, it adds `ls-open`, which pads the board's track by
 * the drawer's width, so a knob change is always in sight.
 *
 * The saved boards keep the old `.fw-runs` column until they move into the
 * lab's layout (PR 6). It is the same `div` in the same first slot as the
 * drawer, and the run column is the third child on both tabs (hidden on the
 * saved boards by class), so `BoardFrame` keeps its node — that is what keeps
 * `<arrowz-board>`'s GL context alive across the tabs.
 */
export function Stage({
  face,
  settings,
  run,
}: {
  face: WorkspaceTab
  settings: ReactNode
  run: ReactNode
}): ReactElement {
  const dict = useDictionary()
  const lab = face === 'lab'
  const reportOpen = useStore((state) => state.ui.report)
  const toggleReport = useStore((state) => state.ui.toggleReport)
  const settingsOpen = useStore((state) => state.ui.settings)
  const toggleSettings = useStore((state) => state.ui.toggleSettings)
  const reportHandle = useFocusBackToHandle(reportOpen, REPORT_ID)
  const settingsHandle = useFocusBackToHandle(settingsOpen, SETTINGS_ID)

  return (
    <div className={lab && settingsOpen ? 'fw-stage ls-open' : 'fw-stage'}>
      {lab ? (
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
      ) : (
        <div className="fw-runs" />
      )}
      <BoardFrame />
      {run}
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
