import type { BoardFile } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { exportCell } from '@arrowz/engine/simple'
import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { saveBoard } from './api/boards'
import { AppRoutes } from './AppRoutes'
import { LabRoute } from './routes/LabRoute'
import { useRun } from './run/useRun'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useStore } from './state/store'
import { viewOf } from './state/view.slice'
import { useGenerator } from './worker/useGenerator'

/**
 * Saves each finished run once. `App` subscribes to one field rather than to
 * the slice: a subscription to `run` would re-render the shell on every
 * progress message. The guard keys on the file object's identity, which is
 * fresh per run even when two runs carve the same board, so pressing Generate
 * twice with the same seed still reports a save both times. The ref survives
 * StrictMode's double-invoked mount effect, which is why the guard is a ref and
 * not a piece of state; LabRoute.browser.test.tsx mounts under StrictMode and
 * counts the POSTs rather than leaving that reasoned and unexercised.
 */
function useStoreSave() {
  const file = useStore((state) => state.run.file)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    const { phase, params: runParams, report } = useStore.getState().run
    if (phase !== 'done' || file === null || runParams === null || report === null) return
    if (posted.current === file) return
    posted.current = file
    // The stored view is the lab's view with top zeroed, as the old lab stores
    // it (`storeView()` in lab-page.ts): a saved board is a picture, and the
    // highlight is a reading aid for the run that just finished.
    //
    // `cell` is the run's own, computed here and not held in the slice: it is
    // the square a viewer opens the file at, which `carve` derives from the
    // size it carved (command.ts:513) rather than from anything typed. Writing
    // it into the slice instead would overwrite the preview field under a user
    // who had just set it.
    const view = { ...viewOf(useStore.getState().view), top: 0, cell: exportCell(runParams.W, runParams.H) }
    const request = storeRequest(file, runParams, view, 'lab', {
      ok: report.ok,
      pieces: report.pieces,
      maxLen: report.metrics?.maxLen ?? null,
      genMs: report.genMs,
      restarts: report.restartsUsed,
      backtracks: report.backtracks,
      stuck: report.stuck,
    })
    // The answer is dropped if it is no longer this run's: pressing Generate
    // again while a slow POST is outstanding clears `saved`, and the stale
    // outcome would otherwise append " — not saved" to the new run's
    // "Generating…" line.
    void saveBoard(request).then((outcome) => {
      const run = useStore.getState().run
      if (run.file === file) run.stored(outcome)
    })
  }, [file])
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
  const onLab = selectedIndex(useLocation().pathname) === 0
  useStoreSave()
  return (
    <div className="fw">
      <TopBar />
      <TabRow />
      <LabRoute control={control} hidden={!onLab} />
      <AppRoutes />
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
