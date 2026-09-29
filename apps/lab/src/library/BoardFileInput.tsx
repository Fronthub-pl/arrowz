import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { BOARD_FILE_INPUT_ID, openBoardFiles } from './openBoardFiles'

/** Asks the browser for board files through the one hidden input. A no-op if it is not mounted. */
export function openFilePicker(): void {
  document.getElementById(BOARD_FILE_INPUT_ID)?.click()
}

/**
 * The one file input, mounted once in `App` so a palette row can reach it as
 * a button does. `multiple`: a board file and its meta are chosen together.
 */
export function BoardFileInput(): ReactElement {
  const navigate = useNavigate()
  return (
    <input
      id={BOARD_FILE_INPUT_ID}
      type="file"
      accept=".json,application/json"
      multiple
      hidden
      onChange={(event) => {
        const input = event.currentTarget
        const files = Array.from(input.files ?? [])
        // Cleared, so choosing the same file again fires `change` again.
        input.value = ''
        void openBoardFiles(files, (path) => void navigate(path))
      }}
    />
  )
}
