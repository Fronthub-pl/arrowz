import type { ReactNode } from 'react'
import type { RunControl } from '../run/useRun'
import { SimplePanel } from '../simple/SimplePanel'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's three-track console: the group rail, one panel, and the run
 * column. The column comes in as a child, and it stays the third child in both
 * views — the rail's slot is `null` in the simple one — because React keeps a
 * node by its type and its position among its siblings. Handing the same
 * element to a second console component would be a new parent, and the column
 * would remount (PR 4a, Ruling 7, which corrects spec §5.1).
 */
export function Console({ control, children }: { control: RunControl; children: ReactNode }) {
  const entry = useStore((state) => state.ui.entry)
  const simple = useStore((state) => state.ui.mode === 'simple')
  return (
    <div className="fw-console">
      {simple ? null : <GroupRail />}
      {simple ? <SimplePanel control={control} /> : entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
      {children}
    </div>
  )
}
