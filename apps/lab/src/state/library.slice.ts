import type { BoardSize } from '@arrowz/engine'

/**
 * Something the library did, as opposed to something it is: a line computed
 * from state alone has nowhere to put an event. `loading` and `saveFailed` are
 * cleared by their own outcome, not a timer (see `notices.ts`). `name` is data;
 * the words around it belong to the dictionary.
 */
export type LibraryNotice =
  | { kind: 'loading'; name: string }
  | { kind: 'viewSaved'; name: string }
  | { kind: 'deleted'; name: string }
  | { kind: 'saveFailed' }
  | { kind: 'deleteFailed' }

/**
 * A board file that could not be drawn. The two halves stay apart for the
 * dictionary's `boardFileError` to word, so a reason containing `: ` arrives
 * whole instead of being split back at a separator.
 */
export interface BoardError {
  /** The `<size>/<id>` the address names. */
  name: string
  /** The failure as it came: a status line, or a decoder's message. */
  reason: string
}

/**
 * What the saved-boards tab knows: the sizes the store listed, and why a fetch
 * failed. No selection: the chosen board is the address (`/boards/:size/:id`).
 * The listing is a cache; only Refresh, a save or a delete forces a new one.
 */
export interface LibraryState {
  /** null until the first listing answers; an empty array is "the store is empty". */
  sizes: BoardSize[] | null
  loading: boolean
  /** Why the listing failed. The list already shown is kept beside it. */
  listError: string | null
  /** Why the board the address names could not be drawn. */
  boardError: BoardError | null
  /** What the library has just done, which the status line says once. */
  notice: LibraryNotice | null
  listing(): void
  listed(sizes: BoardSize[]): void
  listFailed(error: string): void
  /**
   * The answer came back for a panel that had gone. There is nothing to show
   * and nothing to report — only the wait the call started has to end.
   */
  listDropped(): void
  boardFailed(error: BoardError | null): void
  notify(notice: LibraryNotice): void
  clearNotice(): void
  reset(): void
}

type SetStore = (fn: (state: { library: LibraryState }) => { library: LibraryState }) => void

export function createLibrarySlice(set: SetStore): LibraryState {
  const patch = (next: Partial<LibraryState>) => set((state) => ({ library: { ...state.library, ...next } }))
  return {
    sizes: null,
    loading: false,
    listError: null,
    boardError: null,
    notice: null,
    listing: () => patch({ loading: true }),
    listed: (sizes) => patch({ sizes, loading: false, listError: null }),
    // The sizes are left where they are: a refresh that fails must not take
    // the rows away from under the board on screen.
    listFailed: (listError) => patch({ loading: false, listError }),
    // Neither a listing nor a failure: only `loading` comes back down.
    listDropped: () => patch({ loading: false }),
    boardFailed: (boardError) => patch({ boardError }),
    notify: (notice) => patch({ notice }),
    clearNotice: () => patch({ notice: null }),
    reset: () => patch({ sizes: null, loading: false, listError: null, boardError: null, notice: null }),
  }
}
