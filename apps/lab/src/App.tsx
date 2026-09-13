import { defaultParams } from '@arrowz/engine'
import type { BoardFile, Params } from '@arrowz/engine'
import { DEFAULT_VIEW, storeRequest } from '@arrowz/engine/command'
import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { saveBoard } from './api/boards'
import { AppRoutes } from './AppRoutes'
import { LabRoute } from './routes/LabRoute'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useStore } from './state/store'
import { useGenerator } from './worker/useGenerator'

// The knobs are PR 3; until then the top bar shows the defaults a run uses.
const DEFAULTS = defaultParams()

/**
 * Saves each finished run once. `App` subscribes to one field rather than to
 * the slice: a subscription to `run` would re-render the shell on every
 * progress message. The guard keys on the file object's identity, which is
 * fresh per run even when two runs carve the same board, so pressing Generate
 * twice with the same seed still reports a save both times.
 */
function useStoreSave() {
  const file = useStore((state) => state.run.file)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    const { phase, params: runParams, report } = useStore.getState().run
    if (phase !== 'done' || file === null || runParams === null || report === null) return
    if (posted.current === file) return
    posted.current = file
    // The stored view is the lab's view with top zeroed, as the old lab
    // stores it (`storeView()` in lab-page.ts).
    const request = storeRequest(file, runParams, { ...DEFAULT_VIEW, top: 0 }, 'lab', {
      ok: report.ok,
      pieces: report.pieces,
      maxLen: report.metrics?.maxLen ?? null,
      genMs: report.genMs,
      restarts: report.restartsUsed,
      backtracks: report.backtracks,
      stuck: report.stuck,
    })
    void saveBoard(request).then((outcome) => useStore.getState().run.stored(outcome))
  }, [file])
}

/**
 * Exported for the browser tests: `params` is what Generate starts a run with,
 * and a test that must observe a run *in flight* needs a board bigger than the
 * defaults, which carve in tens of milliseconds. PR 3 replaces the prop with
 * the params slice.
 */
export function Shell({ params = DEFAULTS }: { params?: Params }) {
  // Above the routes on purpose: §6 and Ruling 5. A route change must not kill
  // a run, nor unmount <arrowz-board> and dispose its GL context.
  const generator = useGenerator()
  const onLab = selectedIndex(useLocation().pathname) === 0
  useStoreSave()
  return (
    <div className="fw">
      <TopBar W={params.W} H={params.H} />
      <TabRow />
      <LabRoute generator={generator} params={params} hidden={!onLab} />
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
