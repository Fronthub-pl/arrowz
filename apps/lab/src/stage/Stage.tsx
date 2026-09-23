import { type ReactElement, useLayoutEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { REPORT_ID, ReportPanel } from '../report/ReportPanel'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'

/**
 * 70px + 1fr + the report's handle: the mock's run rail, the board, and the
 * report as a drawer on the stage's right edge (spec §4.1). The rail is empty
 * until the run filmstrip fills it — still undelivered, row 7 of the lab
 * spec's §10; the column stays, so the board's width does not move when it
 * arrives. The drawer is toggled by its class, never remounted, or the slide
 * would not animate; closed, the report is `visibility: hidden` (shell.css).
 */
export function Stage(): ReactElement {
  const dict = useDictionary()
  const open = useStore((state) => state.ui.report)
  const toggle = useStore((state) => state.ui.toggleReport)
  const handle = useRef<HTMLButtonElement>(null)

  // A focus inside the report would fall to <body> once the report turns
  // hidden; it moves to the handle, which is how the report comes back — the
  // pattern BoardFrame.tsx uses for solo.
  useLayoutEffect(() => {
    const button = handle.current
    if (open || button === null) return
    const report = document.getElementById(REPORT_ID)
    const active = document.activeElement
    if (report !== null && active !== null && report.contains(active)) button.focus()
  }, [open])

  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <BoardFrame />
      <div className={open ? 'fw-drawer open' : 'fw-drawer'}>
        <button
          ref={handle}
          type="button"
          className="fw-drawer-handle"
          aria-expanded={open}
          aria-controls={REPORT_ID}
          aria-keyshortcuts="R"
          onClick={toggle}
        >
          <span className="t">{dict.t('reportHandle')}</span>
          <span className="c" aria-hidden="true">
            {open ? '▶' : '◀'}
          </span>
        </button>
        <ReportPanel />
      </div>
    </div>
  )
}
