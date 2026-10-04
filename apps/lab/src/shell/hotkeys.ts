import { useEffect } from 'react'
import { saveShown } from '../library/saveShown'
import { generate, generateAndSave, stepSeed } from '../run/actions'
import type { RunControl } from '../run/useRun'
import { readBand } from '../state/band'
import { useStore } from '../state/store'

/**
 * The workspace's single-key shortcuts and ⌘K.
 *
 * Escape precedence: the preset panel, the `…` popover and the top menu take
 * their Escape in the capture phase (`useDismiss`), the command palette at its
 * own target, all with `preventDefault`. `WORKSPACE_KEYS` comes last, in the
 * bubble phase, and `isHotkeyRefused` skips a prevented event, so one Escape
 * closes one layer.
 */

/**
 * Refused whatever the modifiers: a key repeat, a composing IME key, an event
 * consumed closer to the target, a key typed into a field or an editable region.
 */
function isOffLimits(event: KeyboardEvent): boolean {
  if (event.repeat || event.isComposing || event.defaultPrevented) return true
  const target = event.target
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)
  )
}

/** Nothing with Ctrl, ⌘ or Alt (the platform's), and nothing off limits. `usePaletteKey` does not use this guard. */
function isHotkeyRefused(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || isOffLimits(event)
}

/** ⌘ or Ctrl with `letter`, without Alt: ⌘G is Generate and save, ⌘S Save board. */
function isCommandKey(event: KeyboardEvent, letter: string): boolean {
  return event.key.toLowerCase() === letter && (event.metaKey || event.ctrlKey) && !event.altKey
}

/** Escape closes one layer: an open sheet, then the report (it lies over the board), then the settings. */
function closeOneLayer(): void {
  const ui = useStore.getState().ui
  if (ui.sheet !== null) ui.setSheet(null)
  // At XS the drawers exist only as sheets; Escape must not change a drawer state that is invisible there.
  else if (readBand() === 'xs') return
  else if (ui.report) ui.setReport(false)
  else if (ui.settings) ui.setSettings(false)
}

export interface HotkeyRow {
  keys: readonly string[]
  /** Pressed on the saved boards, the key brings the lab first: it runs or seeds the lab board, which is not shown there. */
  lab?: true
  run(control: RunControl): void
}

/**
 * Bound wherever the stage is (the lab and the saved boards), which share each
 * drawer's state. `r` and `s` open the sheets at XS, the drawers above it.
 * `g`, `[` and `]` are the palette footer's, silent while it is open (its
 * search box is an `<input>`); a refused run says nothing here, `RunStatusBar`
 * is the one voice for a broken rule. ⌘G and ⌘S (and Ctrl) are not in the
 * table: they are bound beside it in `useWorkspaceKeys`, and bring the lab as
 * `lab` rows do.
 */
export const WORKSPACE_KEYS: readonly HotkeyRow[] = [
  // Shift is not a modifier here, so `F` too; also with the focus on a button such as Generate.
  { keys: ['f', 'F'], run: () => useStore.getState().ui.toggleSolo() },
  { keys: ['Escape'], run: closeOneLayer },
  {
    keys: ['r', 'R'],
    run: () => {
      const ui = useStore.getState().ui
      if (readBand() === 'xs') ui.toggleSheet('report')
      else ui.toggleReport()
    },
  },
  {
    keys: ['s', 'S'],
    run: () => {
      const ui = useStore.getState().ui
      if (readBand() === 'xs') ui.toggleSheet('settings')
      else ui.toggleSettings()
    },
  },
  { keys: ['g', 'G'], lab: true, run: (control) => generate(control) },
  { keys: [']'], lab: true, run: (control) => stepSeed(control, 1) },
  { keys: ['['], lab: true, run: (control) => stepSeed(control, -1) },
]

/**
 * One bubble-phase listener for `WORKSPACE_KEYS`, while a workspace tab is
 * shown. `toLab` is null on the lab itself, where a `lab` row has nowhere to go.
 */
export function useWorkspaceKeys(onWorkspace: boolean, control: RunControl, toLab: (() => void) | null): void {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (isCommandKey(event, 'g')) {
        if (isOffLimits(event)) return
        // The browser's ⌘G is "find next".
        event.preventDefault()
        toLab?.()
        generateAndSave(control)
        return
      }
      if (isCommandKey(event, 's')) {
        // The browser's "Save page" is never meant here, not even in a field,
        // whose value is not committed yet, so a field saves nothing. Read
        // before `preventDefault`, which `isOffLimits` would take for a consumed key.
        const offLimits = isOffLimits(event)
        event.preventDefault()
        if (offLimits) return
        toLab?.()
        saveShown()
        return
      }
      if (isHotkeyRefused(event)) return
      const row = WORKSPACE_KEYS.find((candidate) => candidate.keys.includes(event.key))
      if (row === undefined) return
      if (row.lab === true) toLab?.()
      row.run(control)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace, control, toLab])
}

/**
 * ⌘K on every route, docs included: navigation is half of what the palette is
 * for. It must open while a knob is being typed into, so it refuses only a
 * missing modifier, Alt, a repeat and a consumed key. `<arrowz-board>`'s
 * `onKeyDown` ignores modified keys, so it cannot swallow it.
 */
export function usePaletteKey(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'k' && event.key !== 'K') return
      if (!event.metaKey && !event.ctrlKey) return
      if (event.altKey || event.repeat || event.defaultPrevented) return
      event.preventDefault()
      useStore.getState().ui.togglePalette()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
