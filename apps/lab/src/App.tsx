import type { BoardFile } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { exportCell } from '@arrowz/engine/simple'
import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { saveBoard } from './api/boards'
import { AppRoutes } from './AppRoutes'
import { CommandPalette } from './palette/CommandPalette'
import { Workspace } from './routes/Workspace'
import { PresetStrip } from './run/PresetStrip'
import { useAutoRun } from './run/useAutoRun'
import { useRun } from './run/useRun'
import { usePaletteKey, useWorkspaceKeys } from './shell/hotkeys'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useDocumentLang } from './shell/useDocumentLang'
import { useBand, useLowWindow } from './shell/useLayoutBand'
import { applyRecipe } from './simple/applyRecipe'
import { narrow } from './state/band'
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
  useWorkspaceKeys(onWorkspace, control)
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
