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
 * saved boards. Always mounted, `hidden` only under the docs route (Ruling 5
 * of PR 2, extended in spec §5.1's PR 5a amendment). The stage is the same node
 * in both tabs — that is what keeps `<arrowz-board>`'s GL context alive — so
 * the tab changes what is around it and never where it is.
 *
 * The panel renames itself rather than being two panels: the tab strip points
 * `aria-controls` at whichever id is on screen (`TabRow.tsx`), and two parallel
 * sections could not both hold one stage.
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
  // Mounted here and not in the library panel: `Console` unmounts the panel on
  // the lab face, so a hook living there could never run its "the address names
  // no board — clear the preview" branch, and the stored board would still be
  // on the stage, in the status line and in place of the report after a return
  // to the lab. Review round 1 measured exactly that: back on `/`, the
  // annotation still read `8×8 · seed 1` over a 25×50 run, and the status line
  // announced a stored board while a carve was going.
  useStoredBoard()
  const open = useOpenBoard()
  const lab = tab === 'lab'
  const panel = lab ? 'lab-panel' : 'boards-panel'
  return (
    // `hidden` stays on the <main>: it is what keeps the document from having
    // two visible `main` landmarks. The id belongs on the tabpanel itself,
    // because that is what the tab strip's `aria-controls` has to resolve to
    // (TabRow.tsx:63) — the docs panel puts it there too. That placement
    // matters more here than anywhere else: the id is the one thing this
    // panel renames with the tab, so the strip has to find it on the
    // <section> rather than on the <main> the whole workspace hides behind.
    <main hidden={hidden}>
      <section id={panel} role="tabpanel" aria-labelledby={`tab-${panel}`} tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <RunStatusBar />
        </div>
        {/* `library` earns its own row template for the same reason `simple`
            has one: with no preset strip, the stage would auto-place into the
            first `auto` row (console.css). `presets-top` (handoff 2, PR 7) is
            the lab with its strip in the top bar, and takes the simple view's
            rows for the same reason. */}
        <div
          className={`fw-lab${lab ? '' : ' library'}${simple ? ' simple' : ''}${lab && !simple && presetsInTop ? ' presets-top' : ''}${solo ? ' solo' : ''}${sheet === null ? '' : ` sheet-${sheet}`}`}
        >
          {/* Every one of these keeps its slot as `null` rather than leaving
              the child list: React keeps a node by type and position among its
              siblings, and a sibling that vanishes shifts `Stage` — remounting
              the element this whole arrangement exists to keep (Ruling 6). */}
          {lab && !simple && !presetsInTop ? <PresetStrip control={control} /> : null}
          {/* The console is the settings drawer's on both tabs, and the run
              column the stage's, hidden by class on the saved boards so a carve
              in flight keeps its node and refs (Ruling 1). The open board's
              column takes its track there (handoff 2, PR 6), keyed by the
              board: an armed Delete belongs to the board it was armed on. */}
          <Stage
            settings={<Console control={control} face={tab} />}
            run={<RunColumn control={control} goRef={goRef} abortRef={abortRef} />}
            side={lab ? null : <BoardColumn key={`${open.size ?? ''}/${open.id ?? ''}`} />}
          />
          {lab ? <ClampNotice focusOnDismiss={goRef} focusOnAbort={abortRef} /> : null}
          {lab ? <Violations /> : null}
        </div>
        {/* After `.fw-lab`, not in it: the lab's children keep their slots
            (Ruling 6), and the bar is shown only at XS (shell.css). */}
        <SheetBar tab={tab} />
      </section>
    </main>
  )
}
