import type { BoardFile } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { exportCell } from '@arrowz/engine/simple'
import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { saveBoard } from './api/boards'
import { AppRoutes } from './AppRoutes'
import { CommandPalette } from './palette/CommandPalette'
import { Workspace } from './routes/Workspace'
import { generate, stepSeed } from './run/actions'
import { useAutoRun } from './run/useAutoRun'
import { useRun } from './run/useRun'
import type { RunControl } from './run/useRun'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useDocumentLang } from './shell/useDocumentLang'
import { useBand, useLowWindow } from './shell/useLayoutBand'
import { applyRecipe } from './simple/applyRecipe'
import { narrow, readBand } from './state/band'
import { useStore } from './state/store'
import { useUrlHash } from './state/useUrlHash'
import { viewOf } from './state/view.slice'
import { useGenerator } from './worker/useGenerator'

/**
 * Saves each shown result once. `App` subscribes to one field rather than to
 * the slice, so a progress message does not re-render the shell. The guard
 * keys on the file object's identity, which is fresh per run even when two runs
 * carve the same board, so pressing Generate twice with the same seed still
 * reports a save both times. The ref survives StrictMode's double-invoked mount
 * effect, which is why the guard is a ref and not a piece of state;
 * Workspace.browser.test.tsx mounts under StrictMode and counts the POSTs.
 *
 * A late answer for a board no longer on screen is the result slice's to drop
 * (`stored` compares the file), so this hook no longer compares anything when
 * the answer arrives.
 */
function useStoreSave() {
  const shown = useStore((state) => state.result.shown)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    if (shown === null || posted.current === shown.file) return
    posted.current = shown.file
    // The stored view is the lab's view with top zeroed: a saved board is a
    // picture, and the highlight is a reading aid for the run that just
    // finished.
    //
    // `cell` is the run's own, computed here and not held in the slice: it is
    // the square a viewer opens the file at, which `carve` derives from the
    // size it carved (command.ts:513) rather than from anything typed. Writing
    // it into the slice instead would overwrite the preview field under a user
    // who had just set it.
    const { file, params, report } = shown
    const view = { ...viewOf(useStore.getState().view), top: 0, cell: exportCell(params.W, params.H) }
    const request = storeRequest(file, params, view, 'lab', {
      ok: report.ok,
      pieces: report.pieces,
      maxLen: report.metrics?.maxLen ?? null,
      genMs: report.genMs,
      restarts: report.restartsUsed,
      backtracks: report.backtracks,
      stuck: report.stuck,
    })
    void saveBoard(request).then((outcome) => useStore.getState().result.stored(file, outcome))
  }, [shown])
}

/**
 * The guard `f`, `g`, `[`, `]`, `r` and `s` all share (and the drawers' Escape): nothing with Ctrl, ⌘ or Alt
 * (those belong to the platform), no key repeat, nothing typed into a field
 * or an editable region.
 *
 * An IME sends the keystrokes of the character being composed, so a key on
 * its way into a character is text — the same reason a field is refused
 * below, arriving through a different door.
 *
 * Already used by someone closer to the keystroke: a listener on the document
 * sees the event whatever anyone else did with it, so refusing a cancelled
 * one is what keeps these hotkeys last in line rather than an extra one.
 *
 * `usePaletteKey` does not call this — resist tidying it in there. ⌘K's
 * contract is the opposite one: it refuses nothing but a missing modifier,
 * because it has to open while a knob is being typed into.
 */
function isHotkeyRefused(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return true
  if (event.isComposing || event.defaultPrevented) return true
  const target = event.target
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)
  )
}

/**
 * The `f` hotkey, the application's first global one (spec §5.1): `f` and `F`
 * alike — Shift is not a modifier here.
 *
 * A focused button is not a field, so `f` on Generate toggles (PR 4b,
 * Ruling 9). The listener lives wherever the stage does — the lab tab and the
 * saved boards — and nowhere else. Escape is not handled here: the command
 * palette owns its own, closing on it in its own key handler
 * (`CommandPalette.tsx`), and `useDrawerKeys` owns the drawers'.
 */
function useSoloKey(onWorkspace: boolean) {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      if (isHotkeyRefused(event)) return
      useStore.getState().ui.toggleSolo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace])
}

/**
 * ⌘K, the application's one global shortcut in the literal sense: every route,
 * the documentation included, because navigation is half of what the palette
 * is for (spec §7). It differs from `f`, `g`, `[` and `]` in refusing nothing
 * but a missing modifier — it has to open while a knob is being typed into —
 * and the modifier is what keeps it from colliding with any typing at all.
 * That is why it does not share `isHotkeyRefused`: the two contracts are
 * opposites, not variants of one rule.
 *
 * `<arrowz-board>` cannot swallow it: its own key handler returns at once on
 * `metaKey || ctrlKey || altKey` (arrowz-board.ts:832).
 */
function usePaletteKey() {
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

/**
 * The two drawers' keys (spec §4.3, handoff 2 PR 1): `r` / `R` toggles the
 * report and `s` / `S` the settings, all refused by `isHotkeyRefused` like `f`.
 * Bound wherever the stage is: the saved boards have both drawers too
 * (handoff 2, PR 6) — the sizes and the preview on the left, the open board's
 * report on the right — and the two tabs share each drawer's state.
 *
 * Escape closes one layer per press, the report before the settings: the
 * report lies over the board, the settings drawer beside it. One listener
 * decides both, so a single press cannot close the two. Escape reaches this
 * listener last: the palette consumes its own Escape in its React handler and
 * the preset panel in a capture-phase listener, and a consumed event is
 * refused here as `defaultPrevented`.
 *
 * An open sheet is the first layer Escape closes (handoff 2, PR 7); the menu
 * and the `…` popover consume their own Escape in capture listeners, as the
 * preset panel does.
 */
function useDrawerKeys(onWorkspace: boolean) {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (isHotkeyRefused(event)) return
      const ui = useStore.getState().ui
      // At XS the drawers are shown only as sheets (handoff 2, PR 7): the
      // keys open the sheets, and a drawer's state is invisible there, so
      // Escape must not change it (Review Focus 2).
      const phone = readBand() === 'xs'
      if (event.key === 'Escape') {
        if (ui.sheet !== null) ui.setSheet(null)
        else if (phone) return
        else if (ui.report) ui.setReport(false)
        else if (ui.settings) ui.setSettings(false)
      } else if (event.key === 'r' || event.key === 'R') {
        if (phone) ui.toggleSheet('report')
        else ui.toggleReport()
      } else if (event.key === 's' || event.key === 'S') {
        if (phone) ui.toggleSheet('settings')
        else ui.toggleSettings()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace])
}

/**
 * The two hotkeys the palette's footer advertises (spec D5): `g` generates and
 * `[` / `]` step the seed and carve it — the experimenter's loop of flipping
 * through boards from one setting. `isHotkeyRefused` is what silences these
 * while the palette is open too, its search box being an `<input>`.
 *
 * A refused run says nothing here: `useRun` refuses a broken rule silently and
 * `RunStatusBar` is the one voice (Ruling 13).
 */
function useRunKeys(onWorkspace: boolean, control: RunControl) {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (isHotkeyRefused(event)) return
      if (event.key === 'g' || event.key === 'G') generate(control)
      else if (event.key === ']') stepSeed(control, 1)
      else if (event.key === '[') stepSeed(control, -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onWorkspace, control])
}

/**
 * What a band change resets (handoff 2, PR 7, spec §4): the sheet and the
 * menu, which belong to the band they were opened in; and the settings
 * drawer, which below 1024px would lie over the board — closed without being
 * remembered, and put back from what was remembered on the way up (D3).
 *
 * Compared with the last band seen rather than skipped on the first run:
 * StrictMode runs a mount effect twice, and a "first run" flag would read the
 * second pass as a change.
 */
function useBandReset() {
  const band = useBand()
  const low = useLowWindow()
  const seen = useRef({ band, low })
  useEffect(() => {
    const was = seen.current
    if (was.band === band && was.low === low) return
    seen.current = { band, low }
    const ui = useStore.getState().ui
    ui.setSheet(null)
    ui.setMenu(false)
    if (narrow(band) && !narrow(was.band)) ui.closeSettingsForNarrow()
    else if (!narrow(band) && narrow(was.band)) ui.restoreSettings()
  }, [band, low])
}

/**
 * Everything above the routes, and nothing a caller configures: what a run is
 * started with is the params slice, which a test drives the way a user does.
 */
function Shell() {
  // Above the routes on purpose: §6 and Ruling 5. A route change must not kill
  // a run, nor unmount <arrowz-board> and dispose its GL context.
  const generator = useGenerator()
  const control = useRun(generator)
  useAutoRun(control)
  const hash = useUrlHash(control)
  // Spec §2.2's last row: the lab opens on a board rather than on an empty
  // stage — it reads the URL, then calls `run()`. This effect is declared
  // after the hash hook's, and React runs mount effects in declaration order,
  // so a pasted link has already been written into the store and this run uses
  // the link's knobs rather than the defaults.
  //
  // Deliberately unguarded, unlike the hash hook's read effect one line above:
  // a ref that survived StrictMode's simulated unmount would leave this page
  // with no run at all. StrictMode invokes a mount effect, then its cleanup,
  // then the effect again, and `useGenerator`'s own cleanup terminates the
  // worker (useGenerator.ts:89) — so the carve the first pass starts is killed
  // and, with a guard in place, never started again. Measured: the StrictMode
  // case in Workspace.browser.test.tsx sits in `running` until its poll times
  // out. Starting twice is what `start()` is built for instead: it kills a
  // busy worker to make room for the next run (useGenerator.ts:94).
  //
  // `control` is stable — `useRun` memoises it and `useGenerator`'s handle has
  // no changing dependency — so this runs at mount and at no other time.
  //
  // In the simple view the recipe is written into the knobs first, unless the
  // page opened on a link — the hash hook's read effect has already run and
  // knows.
  useEffect(() => {
    // In the simple view, a page that did not open on a link opens on the
    // board its recipe describes. Without the draw, so the second pass
    // StrictMode gives this effect writes the very knobs the first one wrote.
    if (useStore.getState().ui.mode === 'simple' && !hash.openedFromLink()) applyRecipe(false)
    control.start()
  }, [control, hash])
  // 0 is the lab, 1 the saved boards, 2 the docs (`TabRow`). The first two are
  // the workspace: one panel, one stage, two faces (spec §5.1).
  const tabIndex = selectedIndex(useLocation().pathname)
  const onWorkspace = tabIndex === 0 || tabIndex === 1
  useStoreSave()
  useSoloKey(onWorkspace)
  useDrawerKeys(onWorkspace)
  useRunKeys(onWorkspace, control)
  usePaletteKey()
  useDocumentLang()
  useBandReset()
  const menu = useStore((state) => state.ui.menu)
  return (
    <div className={menu ? 'fw menu-open' : 'fw'}>
      <TopBar presets={null} />
      <TabRow />
      <Workspace control={control} hidden={!onWorkspace} tab={tabIndex === 1 ? 'library' : 'lab'} />
      <AppRoutes />
      <CommandPalette control={control} />
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
