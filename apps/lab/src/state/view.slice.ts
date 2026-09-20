import type { View, ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, viewNumberOf } from '@arrowz/engine/command'

export type ViewFlag = 'colored' | 'rounded' | 'hilite' | 'voids'

/**
 * Ruling C (palette round-2 addendum, task 2): the cap is a lab choice, not
 * the element's or the engine's — they take any number of colours — so the
 * constant lives here, exported for the test that pins it rather than a
 * literal `8` retyped in two places.
 */
export const PALETTE_CAP = 8

/** What a newly added colour starts as, before the user picks one. */
const NEW_PALETTE_COLOR = '#000000'

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
  /** Name of a built-in board theme; '' draws the element's own colours. */
  theme: string
  /**
   * The custom palette the lab's editor builds, capped at `PALETTE_CAP`
   * colours. Mutually exclusive with `theme` (Ruling B): setting a non-empty
   * palette clears the theme, and choosing a theme clears this back to `[]`.
   * Empty here is the same "no palette" the element itself takes.
   */
  palette: string[]
  /** Commits a field from what was typed. Tolerant, as `viewNumberOf` is. */
  setNumber(field: ViewNumber, raw: string): void
  toggle(flag: ViewFlag): void
  /** Sets a flag to what it is given. `toggle` flips; a link states. */
  setFlag(flag: ViewFlag, on: boolean): void
  /** Also clears the custom palette (Ruling B): a theme and a palette never both apply. */
  setTheme(name: string): void
  /**
   * Replaces the whole palette, clamped to `PALETTE_CAP` and, when the result
   * is non-empty, clearing the theme. The one place the cap and the
   * exclusion are enforced — `addPaletteColor`, `setPaletteColor` and
   * `removePaletteColor` all go through it, so no caller of any of the four
   * can leave the store over the cap or holding both a theme and a palette.
   */
  setPalette(colors: string[]): void
  /** Appends one colour (`NEW_PALETTE_COLOR`), refused silently at the cap. */
  addPaletteColor(): void
  /** Edits the colour at `index`, e.g. from a `<input type="color">`'s value. */
  setPaletteColor(index: number, color: string): void
  /** Removes the colour at `index`. */
  removePaletteColor(index: number): void
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

/**
 * Ruling B and C in one place: clamp to the cap first, then clear the theme
 * only if colours remain — an empty result needs no clearing, since the
 * invariant already holds a theme only while the palette is empty. Every
 * palette-writing action below composes this, so none of them can leave the
 * store over the cap or holding both a theme and a non-empty palette.
 */
function paletteUpdate(state: ViewState, colors: string[]): Pick<ViewState, 'palette' | 'theme'> {
  const clamped = colors.slice(0, PALETTE_CAP)
  return { palette: clamped, theme: clamped.length > 0 ? '' : state.theme }
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
    theme: '',
    palette: [],
    setNumber: (field, raw) => patch({ [field]: viewNumberOf(raw, field) }),
    toggle: (flag) => set((state) => ({ view: { ...state.view, [flag]: !state.view[flag] } })),
    setFlag: (flag, on) => set((state) => ({ view: { ...state.view, [flag]: on } })),
    // Ruling B: a theme is a name the palette never accompanies.
    setTheme: (name) => patch({ theme: name, palette: [] }),
    setPalette: (colors) => set((state) => ({ view: { ...state.view, ...paletteUpdate(state.view, colors) } })),
    addPaletteColor: () =>
      set((state) => {
        // The cap refuses silently: `paletteUpdate` would clamp the ninth
        // colour away again anyway, but returning early skips the no-op write.
        if (state.view.palette.length >= PALETTE_CAP) return { view: state.view }
        return {
          view: { ...state.view, ...paletteUpdate(state.view, [...state.view.palette, NEW_PALETTE_COLOR]) },
        }
      }),
    setPaletteColor: (index, color) =>
      set((state) => ({
        view: {
          ...state.view,
          ...paletteUpdate(
            state.view,
            state.view.palette.map((c, i) => (i === index ? color : c)),
          ),
        },
      })),
    removePaletteColor: (index) =>
      set((state) => ({
        view: {
          ...state.view,
          ...paletteUpdate(
            state.view,
            state.view.palette.filter((_, i) => i !== index),
          ),
        },
      })),
  }
}
