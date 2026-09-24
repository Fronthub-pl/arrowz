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
import { PresetStrip } from './run/PresetStrip'
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
 * Saves each shown result once. Subscribes to one field, not the slice, so a
 * progress message does not re-render the shell. The guard keys on the file
 * object's identity, fresh per run even for the same board, so Generate twice
 * with one seed saves twice. It is a ref so it survives StrictMode's
 * double-invoked mount effect. A late answer for a board no longer on screen is
 * dropped by the result slice (`stored` compares the file).
 */
function useStoreSave() {
  const shown = useStore((state) => state.result.shown)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    if (shown === null || posted.current === shown.file) return
    posted.current = shown.file
    // `top` zeroed: a saved board is a picture, and the highlight is a reading
    // aid for this run. `cell` comes from the board's size (`exportCell`, as
    // `buildCommand` does), not from the slice, so the preview field a user
    // just set is not overwritten.
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
 * The guard `f`, `g`, `[`, `]`, `r`, `s` and the drawers' Escape share: nothing
 * with Ctrl, ⌘ or Alt (the platform's), no key repeat, nothing typed into a
 * field or an editable region. A composing IME key is text too. A cancelled
 * event was consumed closer to the target; refusing it keeps these hotkeys
 * last in line. `usePaletteKey` deliberately does not use this guard.
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
 * `f` / `F` toggles solo (Shift is not a modifier here), also with the focus on
 * a button such as Generate. Bound wherever the stage is: the lab tab and the
 * saved boards. Escape belongs to `CommandPalette` and `useDrawerKeys`.
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
 * ⌘K on every route, docs included: navigation is half of what the palette is
 * for. It refuses nothing but a missing modifier, because it must open while a
 * knob is being typed into, so it does not share `isHotkeyRefused`.
 * `<arrowz-board>`'s `onKeyDown` ignores modified keys, so it cannot swallow it.
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
 * `r` / `R` toggles the report and `s` / `S` the settings, wherever the stage
 * is; the lab and saved-boards tabs share each drawer's state.
 *
 * Escape closes one layer per press, in one listener so a press cannot close
 * two: an open sheet, then the report (it lies over the board), then the
 * settings. It arrives here last: the palette, the preset panel, the menu and
 * the `…` popover consume their own, and `isHotkeyRefused` drops a consumed one.
 */
function useDrawerKeys(onWorkspace: boolean) {
  useEffect(() => {
    if (!onWorkspace) return
    const onKey = (event: KeyboardEvent) => {
      if (isHotkeyRefused(event)) return
      const ui = useStore.getState().ui
      // At XS the drawers exist only as sheets: the keys open the sheets, and
      // Escape must not change a drawer state that is invisible there.
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
 * `g` generates and `[` / `]` step the seed and carve it, as the palette's
 * footer advertises. The palette's search box is an `<input>`, so these are
 * silent while it is open. A refused run says nothing here: `RunStatusBar` is
 * the one voice for a broken rule.
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
 * A band change closes the sheet and the menu (they belong to the band they
 * were opened in) and, going below 1024px, the settings drawer, which would lie
 * over the board: closed without being remembered, restored on the way up.
 * Compared with the last band seen, not skipped on a first run: StrictMode's
 * second pass would read as a change.
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
  // Above the routes: a route change must not kill a run, nor unmount
  // <arrowz-board> and dispose its GL context.
  const generator = useGenerator()
  const control = useRun(generator)
  useAutoRun(control)
  const hash = useUrlHash(control)
  // Open on a board: run once at mount, after `useUrlHash` has read the link
  // (effects run in declaration order). Deliberately no run-once ref:
  // StrictMode's cleanup kills the worker (`useGenerator`'s `kill`), so a
  // guarded second pass would leave no run. Starting twice is safe, because
  // `start()` kills a busy worker. `control` is stable, so this runs at mount only.
  useEffect(() => {
    // In the simple view, unless the page opened on a link, apply the recipe
    // first. Without the draw, so StrictMode's second pass writes the same knobs.
    if (useStore.getState().ui.mode === 'simple' && !hash.openedFromLink()) applyRecipe(false)
    control.start()
  }, [control, hash])
  // 0 is the lab, 1 the saved boards, 2 the docs (`TabRow`). The first two
  // share one workspace: one panel, one stage, two faces.
  const tabIndex = selectedIndex(useLocation().pathname)
  const onWorkspace = tabIndex === 0 || tabIndex === 1
  // A low window gives the board the preset row's height by moving the strip
  // (advanced lab tab only) into the top bar. One instance: the top bar or the lab.
  const low = useLowWindow()
  const advanced = useStore((state) => state.ui.mode === 'advanced')
  const presetsInTop = low && advanced && tabIndex === 0
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
      <TopBar presets={presetsInTop ? <PresetStrip control={control} /> : null} />
      <TabRow />
      <Workspace
        control={control}
        hidden={!onWorkspace}
        tab={tabIndex === 1 ? 'library' : 'lab'}
        presetsInTop={presetsInTop}
      />
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
