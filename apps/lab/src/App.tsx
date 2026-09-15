import type { BoardFile } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { exportCell } from '@arrowz/engine/simple'
import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { saveBoard } from './api/boards'
import { AppRoutes } from './AppRoutes'
import { LabRoute } from './routes/LabRoute'
import { useAutoRun } from './run/useAutoRun'
import { useRun } from './run/useRun'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useDocumentLang } from './shell/useDocumentLang'
import { applyRecipe } from './simple/applyRecipe'
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
 * LabRoute.browser.test.tsx mounts under StrictMode and counts the POSTs.
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
    // The stored view is the lab's view with top zeroed, as the old lab stores
    // it (`storeView()` in lab-page.ts): a saved board is a picture, and the
    // highlight is a reading aid for the run that just finished.
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
 * The `f` hotkey, the application's first global one (spec §5.1): `f` and `F`
 * alike, as the old lab reads both (lab-page.ts:944) — Shift is not a modifier
 * here — and nothing with Ctrl, ⌘ or Alt (the old lab toggled on ⌘F and opened
 * the browser's find as well), no key repeat, nothing typed into a field or an
 * editable region, and nothing off the lab route: the listener exists only
 * while the lab is on screen. A focused button is not a field, so `f` on
 * Generate toggles, as it does in the old lab (PR 4b, Ruling 9). Escape is not
 * handled: the palette of PR 7 owns it.
 */
function useSoloKey(onLab: boolean) {
  useEffect(() => {
    if (!onLab) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select') !== null)
      ) {
        return
      }
      useStore.getState().ui.toggleSolo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onLab])
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
  // stage, as the old lab does at `lab-page.ts:1468-1476` — it reads the URL,
  // then calls `run()`. This effect is declared after the hash hook's, and
  // React runs mount effects in declaration order, so a pasted link has
  // already been written into the store and this run uses the link's knobs
  // rather than the defaults.
  //
  // Deliberately unguarded, unlike the hash hook's read effect one line above:
  // a ref that survived StrictMode's simulated unmount would leave this page
  // with no run at all. StrictMode invokes a mount effect, then its cleanup,
  // then the effect again, and `useGenerator`'s own cleanup terminates the
  // worker (useGenerator.ts:89) — so the carve the first pass starts is killed
  // and, with a guard in place, never started again. Measured: the StrictMode
  // case in LabRoute.browser.test.tsx sits in `running` until its poll times
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
    // The old lab's order (`lab-page.ts:1472-1473`): in the simple view, a
    // page that did not open on a link opens on the board its recipe
    // describes. Without the draw, so the second pass StrictMode gives this
    // effect writes the very knobs the first one wrote.
    if (useStore.getState().ui.mode === 'simple' && !hash.openedFromLink()) applyRecipe(false)
    control.start()
  }, [control, hash])
  const onLab = selectedIndex(useLocation().pathname) === 0
  useStoreSave()
  useSoloKey(onLab)
  useDocumentLang()
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
