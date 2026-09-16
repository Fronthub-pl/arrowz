import { type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * The rail's face in the library: one chip per size, with how many layouts it
 * holds. Choosing a size opens the first board of that size, as the old lab's
 * `selectSize` does (`lab-page.ts:1085-1094`, Ruling 7) — a size with no board
 * cannot be listed, so there is always one to open.
 */
export function SizeChips(): ReactElement {
  const dict = useDictionary()
  const sizes = useStore((state) => state.library.sizes)
  const open = useOpenBoard()
  const navigate = useNavigate()
  // On `/boards` with no board named, the list shows the first size's rows
  // (`BoardList`'s own fallback), so that is the chip that is pressed. Reading
  // the address alone would leave every chip unpressed beside a list of rows.
  const current = open.size ?? sizes?.[0]?.size ?? null
  return (
    <div className="fw-lib-chips" role="group" aria-label={dict.t('tabLibrary')}>
      {(sizes ?? []).map((entry) => (
        <button
          key={entry.size}
          type="button"
          aria-pressed={entry.size === current}
          onClick={() => {
            // Parity with `selectSize` (`lab-page.ts:1085-1094`): a size keeps
            // the board already open when that board belongs to it, and opens
            // its first board otherwise. A chip that always jumped to the first
            // would throw away the board being looked at whenever its own size
            // chip was pressed.
            const target = entry.boards.find((board) => board.id === open.id) ?? entry.boards[0]
            if (target) void navigate(`/boards/${entry.size}/${target.id}`)
          }}
        >
          {`${entry.size} (${entry.boards.length})`}
        </button>
      ))}
    </div>
  )
}
