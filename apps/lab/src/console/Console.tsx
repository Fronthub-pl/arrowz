import type { ReactNode } from 'react'
import { LibraryPanel } from '../library/LibraryPanel'
import { SizeChips } from '../library/SizeChips'
import type { WorkspaceTab } from '../routes/Workspace'
import type { RunControl } from '../run/useRun'
import { SimplePanel } from '../simple/SimplePanel'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'
import { KnobPanel } from './KnobPanel'
import { ViewPanel } from './ViewPanel'

/**
 * The mock's three-track console: a rail, one panel, and the run column. The
 * column comes in as a child and stays the third child in every face — the
 * rail's slot is `null` in the simple view — because React keeps a node by its
 * type and its position among its siblings. Handing the same element to a
 * second console component would be a new parent, and the column would remount
 * (PR 4a, Ruling 7, which corrects spec §5.1).
 *
 * The library is the third face (PR 5a): the size chips take the rail and the
 * list takes the panel, while the column stays mounted and is hidden by class
 * (Ruling 1). Its detail is PR 5b's, under the list in the panel — not in the
 * column's track, which would replace the column instead of hiding it — so the
 * detail now lives inside that panel, as `LibraryPanel`'s own second row,
 * rather than in the console.
 */
export function Console({ control, children, face }: { control: RunControl; children: ReactNode; face: WorkspaceTab }) {
  const entry = useStore((state) => state.ui.entry)
  const simple = useStore((state) => state.ui.mode === 'simple')
  const library = face === 'library'
  return (
    <div className={`fw-console${library ? ' library' : ''}`}>
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
      {children}
    </div>
  )
}
