import { type ParamGroup, PARAM_SPEC } from '@arrowz/engine'
import { readStored, writeStored } from './storage'

/**
 * The groups, in the order PARAM_SPEC introduces them. Derived rather than
 * listed: the console must not be able to hide a group the engine has.
 */
export const RAIL_GROUPS: readonly ParamGroup[] = [...new Set(PARAM_SPEC.map((s) => s.group))]

/** A rail entry: a generator group, or the mock's element section (the preview fields). */
export type RailEntry = ParamGroup | 'preview'

export type ViewMode = 'simple' | 'advanced'

/**
 * What the saved boards' drawer panel shows (handoff 2, PR 6): the boards of
 * the chosen size, or the open board's preview fields — the rail's SIZES and
 * ELEMENT sections, as `entry` is the lab's. Never remembered, never in the
 * hash: the address already names the size.
 */
export type BoardsPanel = 'list' | 'preview'

/** The previous lab's key and values. */
export const MODE_KEY = 'labView'

/** Where the report drawer's state is remembered (spec §4.2). */
export const REPORT_KEY = 'labReport'

/** Where the settings drawer's state is remembered, as the report's is. */
export const SETTINGS_KEY = 'labSettings'

/** Only a stored `advanced` opens the advanced view (Ruling 2). */
export function modeOf(stored: string | null): ViewMode {
  return stored === 'advanced' ? 'advanced' : 'simple'
}

export interface UiState {
  entry: RailEntry
  /** Generate 350 ms after a knob is edited. Off at first. */
  auto: boolean
  /** A preset or a link moved a value into range and has not been dismissed. */
  clamped: boolean
  /** Which console is on screen. Remembered, never in the hash. */
  mode: ViewMode
  /** The board takes the whole lab panel (spec §5.1). Never remembered, never in the hash. */
  solo: boolean
  /** The command palette is on screen (spec §8). Never remembered, never in the hash. */
  palette: boolean
  /** The report drawer is open (spec §4.2). Remembered, never in the hash. */
  report: boolean
  /**
   * The settings drawer is open: the rail and the knob panel on the stage's
   * left edge. Open unless a closed one was remembered, because it does not
   * cover the board. Remembered, never in the hash.
   */
  settings: boolean
  /** The saved boards' drawer panel. */
  boards: BoardsPanel
  /**
   * The DOM id of a control a palette jump asked for — `knob-<key>` or
   * `view-<field>` — waiting for the render that puts it in the tree. The
   * console's `useFocusRequest` consumes it and clears it, so a later render
   * cannot steal the focus a second time (spec §6).
   */
  focusTarget: string | null
  select(entry: RailEntry): void
  setAuto(on: boolean): void
  raiseClamped(on: boolean): void
  setMode(mode: ViewMode): void
  setSolo(on: boolean): void
  toggleSolo(): void
  openPalette(): void
  closePalette(): void
  togglePalette(): void
  setReport(on: boolean): void
  toggleReport(): void
  setSettings(on: boolean): void
  toggleSettings(): void
  showBoards(panel: BoardsPanel): void
  requestFocus(id: string): void
  clearFocusRequest(): void
}

type SetStore = (fn: (state: { ui: UiState }) => { ui: UiState }) => void

export function createUiSlice(set: SetStore): UiState {
  const patch = (next: Partial<UiState>) => set((state) => ({ ui: { ...state.ui, ...next } }))
  return {
    // `board` first: the rail opens on the board group, and the mock shows one
    // group at a time (spec §5.2).
    entry: 'board',
    auto: false,
    clamped: false,
    mode: modeOf(readStored(MODE_KEY)),
    solo: false,
    palette: false,
    report: readStored(REPORT_KEY) === 'open',
    settings: readStored(SETTINGS_KEY) !== 'closed',
    boards: 'list',
    focusTarget: null,
    select: (entry) => patch({ entry }),
    setAuto: (auto) => patch({ auto }),
    raiseClamped: (clamped) => patch({ clamped }),
    setMode: (mode) => {
      writeStored(MODE_KEY, mode)
      patch({ mode })
    },
    setSolo: (solo) => patch({ solo }),
    // Read inside the update, not from a closure: the toggle and the `f` key
    // can both fire before a render.
    toggleSolo: () => set((state) => ({ ui: { ...state.ui, solo: !state.ui.solo } })),
    openPalette: () => patch({ palette: true }),
    closePalette: () => patch({ palette: false }),
    // Read inside the update, like `toggleSolo`: the hotkey and the trigger
    // can both fire before a render.
    togglePalette: () => set((state) => ({ ui: { ...state.ui, palette: !state.ui.palette } })),
    setReport: (report) => {
      writeStored(REPORT_KEY, report ? 'open' : 'closed')
      patch({ report })
    },
    // Read inside the update, like `toggleSolo`: the key and the handle can
    // both fire before a render.
    toggleReport: () =>
      set((state) => {
        const report = !state.ui.report
        writeStored(REPORT_KEY, report ? 'open' : 'closed')
        return { ui: { ...state.ui, report } }
      }),
    setSettings: (settings) => {
      writeStored(SETTINGS_KEY, settings ? 'open' : 'closed')
      patch({ settings })
    },
    // Read inside the update, like `toggleReport`.
    toggleSettings: () =>
      set((state) => {
        const settings = !state.ui.settings
        writeStored(SETTINGS_KEY, settings ? 'open' : 'closed')
        return { ui: { ...state.ui, settings } }
      }),
    showBoards: (boards) => patch({ boards }),
    requestFocus: (focusTarget) => patch({ focusTarget }),
    clearFocusRequest: () => patch({ focusTarget: null }),
  }
}
