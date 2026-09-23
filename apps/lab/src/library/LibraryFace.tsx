import { useStore } from '../state/store'
import { BoardList } from './BoardList'
import { BoardPreview } from './BoardPreview'
import { BoardsRail } from './BoardsRail'
import { useLibraryList } from './useLibraryList'

/**
 * The saved boards' face: the rail of sizes and its panel, the boards of one
 * size or the open board's preview (handoff 2, PR 6). Its own component so
 * that the listing is fetched only where it is shown, and by one caller.
 */
export function LibraryFace() {
  const { refresh } = useLibraryList()
  const panel = useStore((state) => state.ui.boards)
  return (
    <>
      <BoardsRail />
      {panel === 'preview' ? <BoardPreview /> : <BoardList refresh={refresh} />}
    </>
  )
}
