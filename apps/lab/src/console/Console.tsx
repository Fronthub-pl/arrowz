import { LibraryPanel } from '../library/LibraryPanel'
import { SizeChips } from '../library/SizeChips'
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
 * The mock's console: a rail and one panel. On the lab it is the settings
 * drawer's content (handoff 2, PR 1), named by the drawer's handle; the run
 * column it used to hold is the stage's third track now (`Stage.tsx`), so the
 * column no longer moves with the console's faces.
 *
 * The library is the third face (PR 5a): the size chips take the rail and the
 * list takes the panel, under the stage until the saved boards move into the
 * lab's layout (PR 6). Its detail is PR 5b's, `LibraryPanel`'s own second row.
 */
export function Console({ control, face }: { control: RunControl; face: WorkspaceTab }) {
  const entry = useStore((state) => state.ui.entry)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const library = face === 'library'
  // Spec R10: no sizes to list — none yet, or no store to ask — and the chips'
  // track would stand empty beside one sentence (review P7).
  const emptyStore = useStore((state) =>
    state.library.sizes === null ? state.library.listError !== null : state.library.sizes.length === 0,
  )
  // The jump's consumer sits here rather than in a panel: the panels swap, and
  // a hook in the outgoing one would never see the request (spec §6).
  useFocusRequest()
  return (
    <div
      id={library ? undefined : SETTINGS_ID}
      className={`fw-console${library ? ' library' : ''}${library && emptyStore ? ' empty' : ''}`}
    >
      {library ? <SizeChips /> : simple ? null : <GroupRail />}
      {library ? (
        <LibraryPanel />
      ) : simple ? (
        <SimplePanel control={control} />
      ) : entry === 'preview' ? (
        <ViewPanel />
      ) : (
        <KnobPanel group={entry} />
      )}
    </div>
  )
}
