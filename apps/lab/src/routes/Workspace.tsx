import { type ReactElement, useRef } from 'react'
import { Console } from '../console/Console'
import { Violations } from '../console/Violations'
import { BoardColumn } from '../library/BoardColumn'
import { useOpenBoard } from '../library/useOpenBoard'
import { useStoredBoard } from '../library/useStoredBoard'
import { ClampNotice } from '../run/ClampNotice'
import { PresetStrip } from '../run/PresetStrip'
import { RunColumn } from '../run/RunColumn'
import type { RunControl } from '../run/useRun'
import { SheetBar } from '../shell/SheetBar'
import { RunStatusBar } from '../stage/RunStatusBar'
import { Stage } from '../stage/Stage'
import { useStore } from '../state/store'

export type WorkspaceTab = 'lab' | 'library'

/**
 * The one panel of the application's two board-bearing tabs: the lab and the
 * saved boards. Always mounted, `hidden` only under the docs route. The stage
 * is the same node in both tabs (that is what keeps `<arrowz-board>`'s GL
 * context alive), so the tab changes what is around it and never where it is.
 *
 * The panel renames itself rather than being two panels: the tab strip points
 * `aria-controls` at whichever id is on screen, and two parallel sections could
 * not both hold one stage.
 */
export function Workspace({
  control,
  hidden,
  tab,
  presetsInTop,
}: {
  control: RunControl
  hidden: boolean
  tab: WorkspaceTab
  presetsInTop: boolean
}): ReactElement {
  // Owned here rather than in the column, because the notice is the column's
  // sibling: the dismiss button hands the focus back to Generate, or to
  // Abort when Generate is the one disabled.
  const goRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<HTMLButtonElement>(null)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const solo = useStore((state) => state.ui.solo)
  const sheet = useStore((state) => state.ui.sheet)
  const running = useStore((state) => state.run.phase === 'running')
  // Mounted here and not in the library panel: `Console` unmounts the panel on
  // the lab face, so a hook there could never run its "the address names no
  // board, clear the preview" branch, and the stored board would stay on the
  // stage, in the status line and in the report after a return to the lab.
  useStoredBoard()
  const open = useOpenBoard()
  const lab = tab === 'lab'
  const panel = lab ? 'lab-panel' : 'boards-panel'
  return (
    // `hidden` stays on the <main>, so the document never has two visible
    // `main` landmarks. The id belongs on the tabpanel, because the tab strip's
    // `aria-controls` must resolve to it, and it is the one thing this panel
    // renames with the tab.
    <main hidden={hidden}>
      <section id={panel} role="tabpanel" aria-labelledby={`tab-${panel}`} tabIndex={0} className="fw-view">
        {/* The live region, at every band. From 768 up the bar is out of sight
            and the columns' lines are what a person reads. Under 768 the run
            column is a sheet that may be `display: none`, where a live region
            would be silent, so the announcement cannot live in it. */}
        <div className="fw-bar">
          <RunStatusBar />
        </div>
        {/* `library` gets its own row template for the reason `simple` has one:
            with no preset strip, the stage would auto-place into the first
            `auto` row. `presets-top` (the strip in the top bar) takes the
            simple view's rows for the same reason. */}
        <div
          className={`fw-lab${lab ? '' : ' library'}${simple ? ' simple' : ''}${lab && !simple && presetsInTop ? ' presets-top' : ''}${solo ? ' solo' : ''}${sheet === null ? '' : ` sheet-${sheet}`}`}
        >
          {/* Every one of these keeps its slot as `null` rather than leaving
              the child list: React keeps a node by type and position, and a
              vanishing sibling would shift `Stage` and remount the element. */}
          {lab && !simple && !presetsInTop ? <PresetStrip control={control} /> : null}
          {/* The console is the settings drawer's on both tabs, and the run
              column the stage's, hidden by class on the saved boards so a carve
              in flight keeps its node and refs. The open board's column is
              keyed by the board: an armed Delete belongs to the board it was armed on. */}
          <Stage
            settings={<Console control={control} face={tab} />}
            run={<RunColumn control={control} goRef={goRef} abortRef={abortRef} />}
            side={lab ? null : <BoardColumn key={`${open.size ?? ''}/${open.id ?? ''}`} />}
            // Only on the lab: the saved boards' stage shows a stored board,
            // which a carve in flight does not touch.
            busy={lab && running}
          />
          {lab ? <ClampNotice focusOnDismiss={goRef} focusOnAbort={abortRef} /> : null}
          {lab ? <Violations /> : null}
        </div>
        {/* After `.fw-lab`, not in it, so the lab's children keep their slots;
            the sheet bar is shown only at XS. */}
        <SheetBar tab={tab} />
      </section>
    </main>
  )
}
