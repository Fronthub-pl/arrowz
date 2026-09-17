import { decodeBoard } from '@arrowz/engine'
import { useEffect } from 'react'
import { readStoredBoard } from '../api/boards'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * Draws the board the address names. The address is the selection, so this
 * effect needs no guard in the slice: it captures the size and the id it
 * fetched for, and its cleanup drops an answer that arrives after the address
 * moved or the panel went away (Ruling 4) — which is also what StrictMode's
 * double-invoked mount effect produces.
 *
 * A board that cannot be read leaves the stage empty rather than under the
 * previous board's picture, and says why, as the old lab's `refuse` does
 * (`lab-page.ts:1159-1165`). Decoding failures and fetch failures are reported
 * alike: to someone looking at a list, a file that is missing and a file that
 * is unreadable are one thing.
 */
export function useStoredBoard(): void {
  const { size, id } = useOpenBoard()
  const metas = useStore((state) => state.library.sizes)

  useEffect(() => {
    if (size === null || id === null) {
      useStore.getState().result.clearPreview()
      useStore.getState().library.boardFailed(null)
      // Only the word about a fetch. The delete navigates to `/boards` and this
      // branch runs immediately after it — an unconditional clear here erased
      // the `deleted` notice within one commit, measured by review round 1.
      if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
      return
    }
    const meta = metas?.find((entry) => entry.size === size)?.boards.find((board) => board.id === id) ?? null
    if (meta === null) {
      // Before the listing arrives there is nothing to look the id up in, so
      // this waits. Once it has arrived, an id that is not in it is a stale
      // link, and spec §5.6 says the stage is left empty and the reason is
      // shown — not left silent under the previous board (review round 1
      // measured the silence).
      if (metas !== null) {
        useStore.getState().result.clearPreview()
        useStore.getState().library.boardFailed({ name: `${size}/${id}`, reason: 'not in the store' })
        // The fourth of the four exits that must clear `loading`: a board
        // dropped from the listing while its file was in flight otherwise
        // leaves "Loading …" on screen for good, over the very error this
        // line should be printing.
        useStore.getState().library.clearNotice()
      }
      return
    }
    // A new listing is not a reason to fetch a board that is already drawn:
    // `listed()` stores a fresh array on every refresh, including the one a
    // view save makes, and re-fetching brought back the listing's view over an
    // edit in flight and flashed `loading` over `viewSaved` (Ruling 14).
    if (useStore.getState().result.preview?.meta.id === id) {
      // The fifth exit, and the one review round 2 measured stranding a word:
      // open A, click B, click back to A while B's file is still in flight —
      // B's cancelled fetch clears nothing and this return used to happen
      // before any clear, so the line said "Loading B…" for ever over a drawn
      // board A. Nothing else is touched: an unconditional clear here would
      // erase the `viewSaved` that a save's own refresh lands on.
      if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
      return
    }
    let cancelled = false
    // The preview of the board before this one is deliberately left on the
    // stage until this fetch resolves: clearing it here would flash the stage
    // empty between two rows of the same list. It is the one path where the
    // stage shows a board the address does not name, and it lasts exactly as
    // long as the fetch does — every outcome below replaces or clears it.
    useStore.getState().library.boardFailed(null)
    useStore.getState().library.notify({ kind: 'loading', name: `${size}/${id}` })
    void (async () => {
      const outcome = await readStoredBoard(size, id)
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
        state.result.showPreview({ board, file: outcome.file, meta })
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
  }, [size, id, metas])
}
