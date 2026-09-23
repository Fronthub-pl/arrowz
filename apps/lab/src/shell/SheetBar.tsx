import { type ReactElement, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { BOARD_COLUMN_ID } from '../library/BoardColumn'
import { REPORT_ID } from '../report/ReportPanel'
import type { WorkspaceTab } from '../routes/Workspace'
import { RUN_COLUMN_ID } from '../run/RunColumn'
import { SETTINGS_ID } from '../stage/Stage'
import { useStore } from '../state/store'
import type { Sheet } from '../state/ui.slice'

const SHEETS: readonly Sheet[] = ['settings', 'cli', 'report']

/**
 * The phone's bar of bottom sheets (handoff 2, PR 7): three buttons under the
 * board, each opening its panel as a sheet over it. Always mounted and shown
 * only at XS by the stylesheet, so nothing appears among the stage's
 * siblings; it sits after `.fw-lab`, not inside it (Workspace.tsx).
 *
 * A focus inside a sheet that closes would fall to <body> once the sheet is
 * `display: none`; it moves to the sheet's button, as the drawers hand theirs
 * to their handles (Stage.tsx).
 */
export function SheetBar({ tab }: { tab: WorkspaceTab }): ReactElement {
  const dict = useDictionary()
  const sheet = useStore((state) => state.ui.sheet)
  const toggleSheet = useStore((state) => state.ui.toggleSheet)
  const lab = tab === 'lab'
  const panels: Record<Sheet, string> = {
    settings: SETTINGS_ID,
    cli: lab ? RUN_COLUMN_ID : BOARD_COLUMN_ID,
    report: REPORT_ID,
  }
  const labels: Record<Sheet, string> = {
    settings: dict.t(lab ? 'sheetSettings' : 'sheetBoards'),
    cli: dict.t(lab ? 'sheetCli' : 'sheetBoard'),
    report: dict.t('sheetReport'),
  }
  const buttons = useRef(new Map<Sheet, HTMLButtonElement>())
  const shown = useRef(sheet)
  useLayoutEffect(() => {
    const was = shown.current
    shown.current = sheet
    if (was === null || was === sheet) return
    const panel = document.getElementById(panels[was])
    const active = document.activeElement
    if (panel !== null && active !== null && panel.contains(active)) buttons.current.get(was)?.focus()
  })
  return (
    <nav className="fw-sheetbar" aria-label={dict.t('sheetBar')}>
      {SHEETS.map((name) => (
        <button
          key={name}
          ref={(node) => {
            if (node === null) buttons.current.delete(name)
            else buttons.current.set(name, node)
          }}
          type="button"
          aria-pressed={sheet === name}
          aria-controls={panels[name]}
          onClick={() => toggleSheet(name)}
        >
          {labels[name]}
        </button>
      ))}
    </nav>
  )
}
