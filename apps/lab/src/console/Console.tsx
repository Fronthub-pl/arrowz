import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's console with two tracks instead of three: the run column is
 * lifted above the console so both consoles can share one instance (§5.1),
 * and it arrives in the next PR.
 */
export function Console() {
  const entry = useStore((state) => state.ui.entry)
  return (
    <div className="fw-console">
      <GroupRail />
      {entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
    </div>
  )
}
