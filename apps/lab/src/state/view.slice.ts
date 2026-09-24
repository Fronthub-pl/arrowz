import {
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  PAD_RANGE,
  POINT_RADIUS_RANGE,
} from '@arrowz/board-element'
import type { View, ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, viewNumberOf } from '@arrowz/engine/command'

export type ViewFlag = 'colored' | 'rounded' | 'hilite' | 'voids' | 'showPoints'

/**
 * The cap is the lab's choice; the element and the engine take any number of
 * colours. Exported for the test that pins it.
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
  /**
   * The point grid. Like `voids`, the element's settings, not the engine's:
   * `viewOf` does not carry them and the CLI has no flag for them. The bounds
   * are the element's `POINT_RADIUS_RANGE`, never copied.
   */
  showPoints: boolean
  pointColor: string
  pointRadius: number
  setPointColor(color: string): void
  /** Commits the radius from what was typed, tolerant as `setNumber` is. */
  setPointRadius(raw: string): void
  /** Name of a built-in board theme; '' draws the element's own colours. */
  theme: string
  /**
   * The custom palette the lab's editor builds, capped at `PALETTE_CAP`. It
   * coexists with `theme`, overriding the theme's colours; empty is the
   * element's "no palette", which lets the theme's own palette show through.
   */
  palette: string[]
  /**
   * The board's own surface colours, or `''` for "the user has not said", which
   * lets a chosen theme supply them. Never handed to the element as `''`: it
   * sanitises after precedence, so a stated empty string would beat the theme
   * and fall to the element's default, turning a dark theme light.
   */
  paper: string
  ink: string
  /** The highlight colour of the longest pieces and the jammed cells; same "not set" rule as `paper`/`ink`. */
  highlight: string
  setPaper(color: string): void
  setInk(color: string): void
  setHighlight(color: string): void
  /**
   * The margin around the board, in cells: the element's `pad`, clamped to
   * `PAD_RANGE`. No "not set" state (0 is a real margin), so it is always
   * handed to the element.
   */
  pad: number
  /** Commits the margin from what was set, rounded to a whole cell; a non-finite value falls back to `DEFAULT_PAD`, as `setPointRadius` falls back for the radius. */
  setPad(n: number): void
  /** Commits a field from what was typed. Tolerant, as `viewNumberOf` is. */
  setNumber(field: ViewNumber, raw: string): void
  toggle(flag: ViewFlag): void
  /** Sets a flag to what it is given. `toggle` flips; a link states. */
  setFlag(flag: ViewFlag, on: boolean): void
  /** Leaves the custom palette alone: each colour field overrides the theme's own. */
  setTheme(name: string): void
  /**
   * Replaces the whole palette, clamped to `PALETTE_CAP`. All four palette
   * actions write through `paletteUpdate`, so none can leave the store over the
   * cap, and none touches the theme.
   */
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

/** The cap, and only the cap: the theme supplies whatever the palette does not override. */
function paletteUpdate(colors: string[]): Pick<ViewState, 'palette'> {
  return { palette: colors.slice(0, PALETTE_CAP) }
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
    showPoints: false,
    pointColor: DEFAULT_POINT_COLOR,
    pointRadius: DEFAULT_POINT_RADIUS,
    theme: '',
    palette: [],
    paper: '',
    ink: '',
    highlight: '',
    pad: DEFAULT_PAD,
    setNumber: (field, raw) => patch({ [field]: viewNumberOf(raw, field) }),
    toggle: (flag) => set((state) => ({ view: { ...state.view, [flag]: !state.view[flag] } })),
    setFlag: (flag, on) => set((state) => ({ view: { ...state.view, [flag]: on } })),
    setPointColor: (color) => patch({ pointColor: color }),
    setPointRadius: (raw) => {
      const n = Number(raw)
      // An empty or unreadable box is the default, not 0, as in `viewNumberOf`.
      const kept = raw.trim() === '' || !Number.isFinite(n) ? DEFAULT_POINT_RADIUS : n
      patch({ pointRadius: Math.min(Math.max(kept, POINT_RADIUS_RANGE.min), POINT_RADIUS_RANGE.max) })
    },
    setTheme: (name) => patch({ theme: name }),
    setPaper: (color) => patch({ paper: color }),
    setInk: (color) => patch({ ink: color }),
    setHighlight: (color) => patch({ highlight: color }),
    setPad: (n) =>
      patch({
        pad: Number.isFinite(n) ? Math.min(Math.max(Math.round(n), PAD_RANGE.min), PAD_RANGE.max) : DEFAULT_PAD,
      }),
    setPalette: (colors) => set((state) => ({ view: { ...state.view, ...paletteUpdate(colors) } })),
    addPaletteColor: () =>
      set((state) => {
        // The cap refuses silently: `paletteUpdate` would clamp the ninth
        // colour away again anyway, but returning early skips the no-op write.
        if (state.view.palette.length >= PALETTE_CAP) return { view: state.view }
        // See the interface doc above: only the empty-to-one transition turns `colored` on.
        const turnColoredOn = state.view.palette.length === 0
        return {
          view: {
            ...state.view,
            ...paletteUpdate([...state.view.palette, NEW_PALETTE_COLOR]),
            ...(turnColoredOn ? { colored: true } : {}),
          },
        }
      }),
    setPaletteColor: (index, color) =>
      set((state) => ({
        view: {
          ...state.view,
          ...paletteUpdate(state.view.palette.map((c, i) => (i === index ? color : c))),
        },
      })),
    removePaletteColor: (index) =>
      set((state) => ({
        view: {
          ...state.view,
          ...paletteUpdate(state.view.palette.filter((_, i) => i !== index)),
        },
      })),
  }
}
