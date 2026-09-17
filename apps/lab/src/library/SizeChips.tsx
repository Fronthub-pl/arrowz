import { type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { openEntry } from './openEntry'
import { useOpenBoard } from './useOpenBoard'

/**
 * The rail's face in the library: one chip per size, with how many layouts it
 * holds. Choosing a size opens the first board of that size (Ruling 7) — a
 * size with no board cannot be listed, so there is always one to open.
 */
export function SizeChips(): ReactElement {
  const dict = useDictionary()
  const sizes = useStore((state) => state.library.sizes)
  const open = useOpenBoard()
  const navigate = useNavigate()
  const { entry, mismatch } = openEntry(sizes, open.size)
  // The chip of the size whose rows are showing — unless the address asked for
  // a size the store has not got, in which case no chip is what was asked for
  // and none is pressed (spec §5.6).
  const current = mismatch ? null : (entry?.size ?? null)
  return (
    <div className="fw-lib-chips" role="group" aria-label={dict.t('sizeGroup')}>
      {(sizes ?? []).map((entry) => (
        <button
          key={entry.size}
          type="button"
          aria-pressed={entry.size === current}
          onClick={() => {
            // A size keeps the board already open when that board belongs to
            // it, and opens
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
