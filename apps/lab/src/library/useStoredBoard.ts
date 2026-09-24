import { decodeBoard } from '@arrowz/engine'
import { useEffect } from 'react'
import { readStoredBoard } from '../api/boards'
import { useStore } from '../state/store'
import { useOpenBoard } from './useOpenBoard'

/**
 * Draws the board the address names. The address is the selection, so the
 * slice needs no guard: the effect's cleanup drops an answer that arrives after
 * the address moved or the panel went away (or after StrictMode's first pass).
 *
 * A board that cannot be read leaves the stage empty, not under the previous
 * board, and says why. Fetch and decode failures read alike: to someone looking
 * at a list, missing and unreadable are one thing.
 */
export function useStoredBoard(): void {
  const { size, id } = useOpenBoard()
  const metas = useStore((state) => state.library.sizes)

  useEffect(() => {
    if (size === null || id === null) {
      useStore.getState().result.clearPreview()
      useStore.getState().library.boardFailed(null)
      // Clear only a word about the board that just left: a delete navigates
      // here, and an unconditional clear would erase its `deleted` notice.
      // `saveFailed` does not fade, and with its board off screen it would be
      // stranded on an empty stage.
      const kind = useStore.getState().library.notice?.kind
      if (kind === 'loading' || kind === 'saveFailed') useStore.getState().library.clearNotice()
      return
    }
    const meta = metas?.find((entry) => entry.size === size)?.boards.find((board) => board.id === id) ?? null
    if (meta === null) {
      // Before the listing arrives this waits. After, an id not in it is a
      // stale link: the stage is left empty and the reason is shown.
      if (metas !== null) {
        useStore.getState().result.clearPreview()
        useStore.getState().library.boardFailed({ name: `${size}/${id}`, reason: 'not in the store' })
        // Every exit clears `loading`: a board dropped from the listing while
        // its file was in flight would otherwise leave "Loading …" for good.
        useStore.getState().library.clearNotice()
      }
      return
    }
    // Do not re-fetch a board already drawn: `listed()` stores a fresh array on
    // every refresh (a view save makes one), and a re-fetch would bring back the
    // listing's view over an edit in flight and flash `loading` over `viewSaved`.
    if (useStore.getState().result.preview?.meta.id === id) {
      // A, then B, then back to A while B is in flight: B's cancelled fetch
      // clears nothing, so "Loading B…" is cleared here. Only `loading`: the
      // `viewSaved` a save's refresh lands on must survive.
      if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
      return
    }
    let cancelled = false
    // The previous board stays on the stage until this fetch resolves, so the
    // stage does not flash empty between two rows; every outcome below
    // replaces or clears it (`useOpenPreview` guards against that window).
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
