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

/** The old lab's key and values (`lab-page.ts:655`). */
export const MODE_KEY = 'labView'

/** Only a stored `advanced` opens the advanced view (Ruling 2, `lab-page.ts:1479`). */
export function modeOf(stored: string | null): ViewMode {
  return stored === 'advanced' ? 'advanced' : 'simple'
}

export interface UiState {
  entry: RailEntry
  /** Generate 350 ms after a knob is edited. Off at first, as in the old lab. */
  auto: boolean
  /** Show every parameter description. On at first; a link may turn it off. */
  help: boolean
  /** A preset or a link moved a value into range and has not been dismissed. */
  clamped: boolean
  /** Which console is on screen. Remembered, never in the hash — the old lab keeps it out too. */
  mode: ViewMode
  select(entry: RailEntry): void
  setAuto(on: boolean): void
  setHelp(on: boolean): void
  raiseClamped(on: boolean): void
  setMode(mode: ViewMode): void
}

type SetStore = (fn: (state: { ui: UiState }) => { ui: UiState }) => void

export function createUiSlice(set: SetStore): UiState {
  const patch = (next: Partial<UiState>) => set((state) => ({ ui: { ...state.ui, ...next } }))
  return {
    // `board` first: the old lab opens board and skeleton by default, and the
    // mock shows one group at a time (spec §5.2).
    entry: 'board',
    auto: false,
    help: true,
    clamped: false,
    mode: modeOf(readStored(MODE_KEY)),
    select: (entry) => patch({ entry }),
    setAuto: (auto) => patch({ auto }),
    setHelp: (help) => patch({ help }),
    raiseClamped: (clamped) => patch({ clamped }),
    setMode: (mode) => {
      writeStored(MODE_KEY, mode)
      patch({ mode })
    },
  }
}
