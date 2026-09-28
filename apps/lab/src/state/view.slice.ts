import type { View, ViewNumber } from '@arrowz/engine'
import { viewNumberOf } from '@arrowz/engine/command'
import { PALETTE_CAP, readPatch, VIEW_DEFAULTS, type ViewFields, type ViewKey } from './viewSchema'

export { PALETTE_CAP }

export type ViewFlag = 'colored' | 'rounded' | 'highlightLongest' | 'voids' | 'showPoints'

/** What a newly added colour starts as, before the user picks one. */
const NEW_PALETTE_COLOR = '#000000'

export interface ViewState extends ViewFields {
  setPointColor(color: string): void
  /** Commits the radius from what was typed, tolerant as `setNumber` is. */
  setPointRadius(raw: string): void
  setPaper(color: string): void
  setInk(color: string): void
  setHighlightColor(color: string): void
  /** Commits the margin from what was set, rounded to a whole cell; a non-finite value falls back to `DEFAULT_PAD`, as `setPointRadius` falls back for the radius. */
  setPad(n: number): void
  /** Commits a field from what was typed. Tolerant, as `viewNumberOf` is. */
  setNumber(field: ViewNumber, raw: string): void
  toggle(flag: ViewFlag): void
  /** Sets a flag to what it is given. `toggle` flips; a link states. */
  setFlag(flag: ViewFlag, on: boolean): void
  /** Leaves the custom palette alone: each colour field overrides the theme's own. */
  setTheme(name: string): void
  /** Replaces the whole palette, read by `VIEW_SCHEMA.palette` (the cap, `#rrggbb`). None of the palette actions touches the theme. */
  setPalette(colors: string[]): void
  /**
   * Appends one colour (`NEW_PALETTE_COLOR`), refused silently at the cap. The
   * first colour also turns `colored` on: the element gates piece colours
   * behind it, so the palette would otherwise draw nothing. Later colours and
   * removals leave the flag alone. Only here, not in `setPalette`: a restored
   * link states its own `colored`, which a shared auto-enable would override.
   */
  addPaletteColor(): void
  /** Edits the colour at `index`, e.g. from a `<input type="color">`'s value. */
  setPaletteColor(index: number, color: string): void
  /** Removes the colour at `index`. */
  removePaletteColor(index: number): void
  /** Writes the fields the patch names in one update, each normalised by `VIEW_SCHEMA`; the rest stay. */
  apply(patch: Partial<ViewFields>): void
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
    top: state.highlightLongest ? state.top : 0,
  }
}

export function createViewSlice(set: SetStore): ViewState {
  const patch = (next: Partial<ViewState>) => set((state) => ({ view: { ...state.view, ...next } }))
  // Every setter except `setNumber` and `toggle` goes through the schema's readers.
  const write = (raw: Partial<Record<ViewKey, unknown>>) => patch(readPatch(raw))
  return {
    ...VIEW_DEFAULTS,
    apply: (fields) => write(fields),
    // `viewNumberOf`, not the schema: an emptied field falls back to the CLI's default, not the lab's start.
    setNumber: (field, raw) => patch({ [field]: viewNumberOf(raw, field) }),
    toggle: (flag) => set((state) => ({ view: { ...state.view, [flag]: !state.view[flag] } })),
    setFlag: (flag, on) => write({ [flag]: on }),
    setPointColor: (color) => write({ pointColor: color }),
    setPointRadius: (raw) => write({ pointRadius: raw }),
    setTheme: (name) => write({ theme: name }),
    setPaper: (color) => write({ paper: color }),
    setInk: (color) => write({ ink: color }),
    setHighlightColor: (color) => write({ highlightColor: color }),
    setPad: (n) => write({ pad: n }),
    setPalette: (colors) => write({ palette: colors }),
    addPaletteColor: () =>
      set((state) => {
        // The cap refuses silently: the reader would drop the ninth colour anyway.
        if (state.view.palette.length >= PALETTE_CAP) return { view: state.view }
        // See the interface doc above: only the empty-to-one transition turns `colored` on.
        const turnColoredOn = state.view.palette.length === 0
        return {
          view: {
            ...state.view,
            ...readPatch({ palette: [...state.view.palette, NEW_PALETTE_COLOR] }),
            ...(turnColoredOn ? { colored: true } : {}),
          },
        }
      }),
    setPaletteColor: (index, color) =>
      set((state) => ({
        view: {
          ...state.view,
          ...readPatch({ palette: state.view.palette.map((c, i) => (i === index ? color : c)) }),
        },
      })),
    removePaletteColor: (index) =>
      set((state) => ({
        view: {
          ...state.view,
          ...readPatch({ palette: state.view.palette.filter((_, i) => i !== index) }),
        },
      })),
  }
}
