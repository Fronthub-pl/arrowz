import type { ReactNode } from 'react'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's three-track console: the group rail, one panel, and the run
 * column. The column comes in as a child rather than being built here, so the
 * simple console of PR 4 shows the same instance and a run in flight survives
 * the swap (§5.1, Ruling 2).
 */
export function Console({ children }: { children: ReactNode }) {
  const entry = useStore((state) => state.ui.entry)
  return (
    <div className="fw-console">
      <GroupRail />
      {entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
      {children}
    </div>
  )
}
