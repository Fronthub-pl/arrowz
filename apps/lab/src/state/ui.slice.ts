import { type ParamGroup, PARAM_SPEC } from '@arrowz/engine'

/**
 * The groups, in the order PARAM_SPEC introduces them. Derived rather than
 * listed: the console must not be able to hide a group the engine has.
 */
export const RAIL_GROUPS: readonly ParamGroup[] = [...new Set(PARAM_SPEC.map((s) => s.group))]

/** A rail entry: a generator group, or the mock's element section (the preview fields). */
export type RailEntry = ParamGroup | 'preview'

export interface UiState {
  entry: RailEntry
  select(entry: RailEntry): void
}

type SetStore = (fn: (state: { ui: UiState }) => { ui: UiState }) => void

export function createUiSlice(set: SetStore): UiState {
  return {
    // `board` first: the old lab opens board and skeleton by default, and the
    // mock shows one group at a time (spec §5.2).
    entry: 'board',
    select: (entry) => set((state) => ({ ui: { ...state.ui, entry } })),
  }
}
