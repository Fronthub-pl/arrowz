import type { View, ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, viewNumberOf } from '@arrowz/engine/command'

export type ViewFlag = 'colored' | 'rounded' | 'hilite' | 'voids'

export interface ViewState {
  cell: number
  stroke: number
  headWidth: number
  headHeight: number
  top: number
  colored: boolean
  rounded: boolean
  hilite: boolean
  voids: boolean
  /** Commits a field from what was typed. Tolerant, as `viewNumberOf` is. */
  setNumber(field: ViewNumber, raw: string): void
  toggle(flag: ViewFlag): void
  /** Sets a flag to what it is given. `toggle` flips; a link states. */
  setFlag(flag: ViewFlag, on: boolean): void
}

type SetStore = (fn: (state: { view: ViewState }) => { view: ViewState }) => void

/**
 * The CLI's view. `top` is the one field with two surfaces: a count and a
 * flag. `carve` has no "highlight" flag — a top of 0 is the absence of one —
 * so the flag folds into the number here and nowhere else.
 */
export function viewOf(state: ViewState): View {
  return {
    cell: state.cell,
    stroke: state.stroke,
    headWidth: state.headWidth,
    headHeight: state.headHeight,
    colored: state.colored,
    rounded: state.rounded,
    top: state.hilite ? state.top : 0,
  }
}

export function createViewSlice(set: SetStore): ViewState {
  const patch = (next: Partial<ViewState>) => set((state) => ({ view: { ...state.view, ...next } }))
  return {
    // The lab's own starting values, not DEFAULT_VIEW's:
    // `cell` and `top` are the page's, the rest the CLI's.
    cell: 12,
    stroke: DEFAULT_VIEW.stroke,
    headWidth: DEFAULT_VIEW.headWidth,
    headHeight: DEFAULT_VIEW.headHeight,
    top: 5,
    colored: false,
    rounded: true,
    hilite: true,
    voids: true,
    setNumber: (field, raw) => patch({ [field]: viewNumberOf(raw, field) }),
    toggle: (flag) => set((state) => ({ view: { ...state.view, [flag]: !state.view[flag] } })),
    setFlag: (flag, on) => set((state) => ({ view: { ...state.view, [flag]: on } })),
  }
}
