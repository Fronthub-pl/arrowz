import { Console } from '../console/Console'
import { Violations } from '../console/Violations'
import { RunColumn } from '../run/RunColumn'
import type { RunControl } from '../run/useRun'
import { RunStatusBar } from '../stage/RunStatusBar'
import { Stage } from '../stage/Stage'

/**
 * Always mounted, `hidden` when the route is elsewhere (Ruling 5). The run
 * column of §5.1 lives inside the console; `.fw-bar` keeps `RunStatusBar` alone.
 */
export function LabRoute({ control, hidden }: { control: RunControl; hidden: boolean }) {
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
          <Stage />
          <Console>
            <RunColumn control={control} />
          </Console>
          <Violations />
        </div>
      </section>
    </main>
  )
}
