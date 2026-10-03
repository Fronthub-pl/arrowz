import { useEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { BoardFileInput } from './library/BoardFileInput'
import { useStoreSave } from './library/useStoreSave'
import { CommandPalette } from './palette/CommandPalette'
import { Workspace } from './routes/Workspace'
import { PresetStrip } from './run/PresetStrip'
import { useAutoRun } from './run/useAutoRun'
import { useRun } from './run/useRun'
import { useShownHash } from './run/useShownHash'
import { useSeries } from './series/useSeries'
import { usePaletteKey, useWorkspaceKeys } from './shell/hotkeys'
import { useRememberBoards } from './shell/lastBoards'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useBandReset } from './shell/useBandReset'
import { useDocumentLang } from './shell/useDocumentLang'
import { useLowWindow } from './shell/useLayoutBand'
import { applyRecipe } from './simple/applyRecipe'
import { useStore } from './state/store'
import { useUrlHash } from './state/useUrlHash'
import { useGenerator } from './worker/useGenerator'

/**
 * Everything above the routes, and nothing a caller configures: what a run is
 * started with is the params slice, which a test drives the way a user does.
 */
function Shell() {
  // Above the routes: a route change must not kill a run, nor unmount
  // <arrowz-board> and dispose its GL context.
  const generator = useGenerator()
  const series = useSeries()
  const control = useRun(generator, series)
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
  useShownHash()
  useRememberBoards()
  const navigate = useNavigate()
  useWorkspaceKeys(onWorkspace, control, tabIndex === 0 ? null : () => void navigate('/'))
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
      <BoardFileInput />
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
