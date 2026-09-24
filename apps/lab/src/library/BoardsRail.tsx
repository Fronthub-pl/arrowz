import type React from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { openEntry } from './openEntry'
import { useOpenBoard } from './useOpenBoard'

/** The rail's one entry that is not a size: the open board's preview fields. */
const PREVIEW = 'preview'

/** A size as the rail prints it: the store's directory name, `x` drawn as `×`. */
export const sizeName = (size: string) => size.replace('x', '×')

export const boardsTabId = (entry: string) => `boards-tab-${entry}`
export const BOARDS_LIST_ID = 'boards-panel-list'
export const BOARDS_PREVIEW_ID = 'boards-panel-preview'

/**
 * The saved boards' rail, in the settings drawer as the lab's `GroupRail` is:
 * SIZES (one tab per size, with its board count), then ELEMENT and its one tab,
 * Preview. A vertical tablist: choosing an entry replaces the panel beside it.
 *
 * Choosing a size opens a board of it: the one already open when it belongs to
 * that size, the first otherwise. A size with no board cannot be listed, so
 * there is always one to open. With no store, or an empty one, SIZES holds no
 * tab and the panel says why.
 */
export function BoardsRail() {
  const dict = useDictionary()
  const sizes = useStore((state) => state.library.sizes)
  const panel = useStore((state) => state.ui.boards)
  const showBoards = useStore((state) => state.ui.showBoards)
  const open = useOpenBoard()
  const navigate = useNavigate()
  const { entry, mismatch } = openEntry(sizes, open.size)
  // The size whose rows are listed, unless the address asked for a size the
  // store has not got: then none is selected.
  const listed = mismatch ? null : (entry?.size ?? null)
  const selected = panel === 'preview' ? PREVIEW : listed
  const all = sizes ?? []
  const entries = [...all.map((size) => size.size), PREVIEW]
  // A tablist keeps one tab in the tab order even when none is selected.
  const tabbable = selected ?? entries[0]

  const choose = (value: string) => {
    if (value === PREVIEW) {
      showBoards('preview')
      return
    }
    showBoards('list')
    const size = all.find((candidate) => candidate.size === value)
    const target = size?.boards.find((board) => board.id === open.id) ?? size?.boards[0]
    if (size !== undefined && target !== undefined) void navigate(`/boards/${size.size}/${target.id}`)
  }

  const move = (delta: number) => {
    const at = selected === null ? -1 : entries.indexOf(selected)
    const next = entries[(at + delta + entries.length) % entries.length]
    if (next !== undefined) choose(next)
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => {
        const first = entries[0]
        if (first !== undefined) choose(first)
      },
      End: () => choose(PREVIEW),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  // Focus follows the selection only while the rail already holds the focus,
  // as in `GroupRail`: a selection made from elsewhere must not pull it in.
  const focusIfSelected = (on: boolean) => (node: HTMLButtonElement | null) => {
    if (node && on && node.parentElement?.contains(document.activeElement)) node.focus()
  }

  const tab = (value: string, children: React.ReactNode, label?: string) => {
    const on = value === selected
    return (
      <button
        key={value}
        type="button"
        role="tab"
        id={boardsTabId(value)}
        aria-selected={on}
        {...(on ? { 'aria-controls': value === PREVIEW ? BOARDS_PREVIEW_ID : BOARDS_LIST_ID } : {})}
        {...(label === undefined ? {} : { 'aria-label': label })}
        tabIndex={value === tabbable ? 0 : -1}
        ref={focusIfSelected(on)}
        onKeyDown={onKeyDown}
        onClick={() => choose(value)}
      >
        {children}
      </button>
    )
  }

  return (
    <div className="fw-rail" role="tablist" aria-orientation="vertical" aria-label={dict.t('boardsRailLabel')}>
      <span className="sec caps" aria-hidden="true">
        {dict.t('railSizes')}
      </span>
      {all.map((size) =>
        tab(
          size.size,
          <>
            <span>{sizeName(size.size)}</span>
            <span className="cnt">{size.boards.length}</span>
          </>,
          // A bare count announces "25×50 3"; the name says what the 3 is.
          dict.t('sizeTab', sizeName(size.size), size.boards.length),
        ),
      )}
      <span className="sec caps" aria-hidden="true">
        {dict.t('railElement')}
      </span>
      {tab(PREVIEW, <span>{dict.t('preview')}</span>)}
    </div>
  )
}
