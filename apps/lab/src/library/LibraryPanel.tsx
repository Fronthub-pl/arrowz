import { type ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { BoardDetail } from './BoardDetail'
import { BoardList } from './BoardList'
import { useLibraryList } from './useLibraryList'
import { useOpenBoard } from './useOpenBoard'

/**
 * The console's panel track in the library face: the rows in a row that
 * scrolls, and the detail in one that does not (spec §5.1, PR 5b). The old lab
 * scatters the same controls across the aside and the list; one block under the
 * list is what Ruling 1 of the previous plan left room for.
 *
 * `useLibraryList` is called here and nowhere else. Its guard only stops a
 * second fetch after an answer has arrived, so two children calling it against
 * an empty cache would both fetch; `refresh` goes down instead.
 */
export function LibraryPanel(): ReactElement {
  const dict = useDictionary()
  const { refresh } = useLibraryList()
  const open = useOpenBoard()
  return (
    <section className="fw-lib-panel" aria-label={dict.t('tabLibrary')}>
      <BoardList refresh={refresh} />
      <BoardDetail key={`${open.size ?? ''}/${open.id ?? ''}`} refresh={refresh} />
    </section>
  )
}
