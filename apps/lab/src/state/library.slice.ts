import type { BoardSize } from '@arrowz/engine'

/**
 * A board file that could not be drawn. The two halves are kept apart rather
 * than joined into one sentence: whoever prints this hands them to the
 * dictionary, whose words go around them (`boardFileError`), and a reason that
 * carries a `: ` of its own then reaches it whole. Joined, the reader had to
 * split the string back at the first `: ` — a contract between two modules
 * about a separator that also occurs inside the data.
 */
export interface BoardError {
  /** The `<size>/<id>` the address names. */
  name: string
  /** The failure as it came: a status line, or a decoder's message. */
  reason: string
}

/**
 * What the saved-boards tab knows: the sizes the store listed, and why a fetch
 * failed. There is no selection here — the chosen board is the address
 * (`/boards/:size/:id`, spec §5.6), and a second copy of it would be a second
 * thing to keep in step with the URL.
 *
 * The cache is the old lab's `boardsCache` (`lab-page.ts:826`): entering the
 * tab uses what is there, and only Refresh, a save or a delete forces a new
 * listing.
 */
export interface LibraryState {
  /** null until the first listing answers; an empty array is "the store is empty". */
  sizes: BoardSize[] | null
  loading: boolean
  /** Why the listing failed. The list already shown is kept beside it. */
  listError: string | null
  /** Why the board the address names could not be drawn. */
  boardError: BoardError | null
  listing(): void
  listed(sizes: BoardSize[]): void
  listFailed(error: string): void
  boardFailed(error: BoardError | null): void
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
    listing: () => patch({ loading: true }),
    listed: (sizes) => patch({ sizes, loading: false, listError: null }),
    // The sizes are left where they are: a refresh that fails must not take
    // the rows away from under the board on screen.
    listFailed: (listError) => patch({ loading: false, listError }),
    boardFailed: (boardError) => patch({ boardError }),
    reset: () => patch({ sizes: null, loading: false, listError: null, boardError: null }),
  }
}
