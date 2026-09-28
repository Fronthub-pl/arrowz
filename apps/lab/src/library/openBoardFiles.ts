import { useStore } from '../state/store'
import { readBoardFiles } from './readBoardFiles'

/** A file preview's address. One, since a file has no size folder and no id the store knows. */
export const FILE_ROUTE = '/boards/file'

/** The one hidden file input every way of opening clicks (`BoardFileInput`). */
export const BOARD_FILE_INPUT_ID = 'board-file-input'

/**
 * Every way of opening a board file ends here. The outcome, good or bad, is
 * shown on the saved boards, whose line is where a board that cannot be read
 * is already reported; the run's own result is not touched.
 */
export async function openBoardFiles(files: readonly File[], navigate: (path: string) => void): Promise<void> {
  if (files.length === 0) return
  const outcome = await readBoardFiles(files)
  const { result, library, ui } = useStore.getState()
  library.clearNotice()
  if (outcome.ok) {
    library.boardFailed(null)
    result.showPreview({
      origin: 'file',
      board: outcome.board,
      file: outcome.file,
      meta: outcome.meta,
      name: outcome.name,
      id: outcome.id,
    })
  } else {
    result.clearPreview()
    library.boardFailed(
      outcome.problem === null
        ? { name: outcome.name, reason: outcome.reason }
        : { name: outcome.name, reason: null, problem: outcome.problem },
    )
  }
  ui.showBoards('list')
  navigate(FILE_ROUTE)
}
