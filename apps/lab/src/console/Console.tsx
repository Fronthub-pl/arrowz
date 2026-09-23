import { LibraryFace } from '../library/LibraryFace'
import type { WorkspaceTab } from '../routes/Workspace'
import type { RunControl } from '../run/useRun'
import { SimplePanel } from '../simple/SimplePanel'
import { SETTINGS_ID } from '../stage/Stage'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { useFocusRequest } from './useFocusRequest'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's console: a rail and one panel, the settings drawer's content on
 * both faces (handoff 2, PR 1 and PR 6), named by the drawer's handle. On the
 * lab the rail is the generator's groups and the element's preview; on the
 * saved boards it is the store's sizes and the same preview entry.
 */
export function Console({ control, face }: { control: RunControl; face: WorkspaceTab }) {
  const entry = useStore((state) => state.ui.entry)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const library = face === 'library'
  // The jump's consumer sits here rather than in a panel: the panels swap, and
  // a hook in the outgoing one would never see the request (spec §6).
  useFocusRequest()
  return (
    <div id={SETTINGS_ID} className={`fw-console${library ? ' library' : ''}`}>
      {library ? (
        <LibraryFace />
      ) : simple ? (
        <SimplePanel control={control} />
      ) : (
        <>
          <GroupRail />
          {entry === 'preview' ? <ViewPanel /> : <KnobPanel group={entry} />}
        </>
      )}
    </div>
  )
}
