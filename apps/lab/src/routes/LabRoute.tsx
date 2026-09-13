import { useRef } from 'react'
import { Console } from '../console/Console'
import { Violations } from '../console/Violations'
import { ClampNotice } from '../run/ClampNotice'
import { PresetStrip } from '../run/PresetStrip'
import { RunColumn } from '../run/RunColumn'
import type { RunControl } from '../run/useRun'
import { RunStatusBar } from '../stage/RunStatusBar'
import { Stage } from '../stage/Stage'

/**
 * Always mounted, `hidden` when the route is elsewhere (Ruling 5). The run
 * column of §5.1 lives inside the console; `.fw-bar` keeps `RunStatusBar` alone.
 */
export function LabRoute({ control, hidden }: { control: RunControl; hidden: boolean }) {
  // Owned here rather than in the column, because the notice is the column's
  // sibling: the dismiss button hands the focus back to Generate.
  const goRef = useRef<HTMLButtonElement>(null)
  return (
    // `hidden` stays on the <main>: it is what keeps the document from having
    // two visible `main` landmarks. The id belongs on the tabpanel itself,
    // because that is what the tab strip's `aria-controls` has to resolve to
    // (TabRow.tsx:63) — the other two panels put it there too.
    <main hidden={hidden}>
      <section id="lab-panel" role="tabpanel" aria-labelledby="tab-lab-panel" tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <RunStatusBar />
        </div>
        <div className="fw-lab">
          <PresetStrip control={control} />
          <Stage />
          <Console>
            <RunColumn control={control} goRef={goRef} />
          </Console>
          <ClampNotice focusOnDismiss={goRef} />
          <Violations />
        </div>
      </section>
    </main>
  )
}
