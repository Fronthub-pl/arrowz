import { type BoardSize, decodeBoard } from '@arrowz/engine'
import { type FileOutcome, readStoredBoard } from '../api/boards'
import { useStore } from '../state/store'

/** The address `useOpenBoard` reads: a stored board's size and id, or the opened file. */
export interface BoardAddress {
  readonly size: string | null
  readonly id: string | null
  readonly file: boolean
}

const nothing = () => {}

/**
 * Brings the stage and the library's words in line with the address: reads and
 * draws the stored board it names, or clears what no longer belongs. Returns
 * the cancel of a read in flight, which drops its answer; the other exits have
 * nothing to cancel.
 *
 * A board that cannot be read leaves the stage empty, not under the previous
 * board, and says why. Fetch and decode failures read alike: to someone looking
 * at a list, missing and unreadable are one thing.
 */
export function openStoredBoard(
  address: BoardAddress,
  metas: BoardSize[] | null,
  read: (size: string, id: string) => Promise<FileOutcome> = readStoredBoard,
): () => void {
  const { size, id, file } = address
  // A file's preview is set by `openBoardFiles`, not fetched. A stored board
  // left drawn by an earlier address (its fetch already resolved) is cleared
  // here too, or the column would call it gone while the stage still shows it.
  if (file) {
    if (useStore.getState().result.preview?.origin === 'store') useStore.getState().result.clearPreview()
    if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
    return nothing
  }
  if (size === null || id === null) {
    useStore.getState().result.clearPreview()
    useStore.getState().library.boardFailed(null)
    // Clear only a word about the board that just left: a delete navigates
    // here, and an unconditional clear would erase its `deleted` notice.
    // `saveFailed` does not fade, and with its board off screen it would be
    // stranded on an empty stage.
    const kind = useStore.getState().library.notice?.kind
    if (kind === 'loading' || kind === 'saveFailed') useStore.getState().library.clearNotice()
    return nothing
  }
  const meta = metas?.find((entry) => entry.size === size)?.boards.find((board) => board.id === id) ?? null
  if (meta === null) {
    // Before the listing arrives this waits. After, an id not in it is a
    // stale link: the stage is left empty and the reason is shown.
    if (metas !== null) {
      useStore.getState().result.clearPreview()
      useStore.getState().library.boardFailed({ name: `${size}/${id}`, reason: null })
      // A board dropped from the listing while its file was in flight would
      // otherwise leave "Loading …" for good.
      useStore.getState().library.clearNotice()
    }
    return nothing
  }
  // Do not re-read a board already drawn: `listed()` stores a fresh array on
  // every refresh (a view save makes one), and a re-read would bring back the
  // listing's view over an edit in flight and flash `loading` over `viewSaved`.
  const drawn = useStore.getState().result.preview
  if (drawn?.origin === 'store' && drawn.meta.id === id) {
    // A, then B, then back to A while B is in flight: B's cancelled read
    // clears nothing, so "Loading B…" is cleared here. Only `loading`: the
    // `viewSaved` a save's refresh lands on must survive.
    if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
    return nothing
  }
  let cancelled = false
  // The previous board stays on the stage until this read resolves, so the
  // stage does not flash empty between two rows; every outcome below
  // replaces or clears it (`useOpenPreview` guards against that window).
  useStore.getState().library.boardFailed(null)
  useStore.getState().library.notify({ kind: 'loading', name: `${size}/${id}` })
  void (async () => {
    const outcome = await read(size, id)
    if (cancelled) return
    const state = useStore.getState()
    const name = `${size}/${id}`
    if (!outcome.ok) {
      state.library.clearNotice()
      state.result.clearPreview()
      state.library.boardFailed({ name, reason: outcome.error })
      return
    }
    try {
      const board = decodeBoard(outcome.file)
      if (cancelled) return
      state.library.clearNotice()
      state.result.showPreview({ origin: 'store', board, file: outcome.file, meta })
    } catch (err) {
      if (cancelled) return
      state.library.clearNotice()
      state.result.clearPreview()
      state.library.boardFailed({ name, reason: err instanceof Error ? err.message : String(err) })
    }
  })()
  return () => {
    cancelled = true
  }
}
