import { create } from 'zustand'
import { createRunSlice, type RunState } from './run.slice'

/**
 * One store, one slice for now. PR 3 adds params, view and ui; PR 4 adds lang
 * and recipe; PR 5 adds library. Each is a named field rather than a flat
 * spread, so a per-knob selector can reach exactly its own entry.
 */
export interface Store {
  run: RunState
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
}))
