import { expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { cancelFlash } from '../console/flash'
import { cancelNoticeFade } from '../library/notices'
import { cancelPendingSave } from '../library/useViewSave'
import { useStore } from '../state/store'
import type { ViewMode } from '../state/ui.slice'

/**
 * Puts back everything a whole-app case can move. The address first: a case
 * that navigated must not leave the next on /boards, and a leftover fragment
 * would be read as a pasted link; `replaceState` also clears `history.state`,
 * react-router's record. The view slice has no reset; a case that moves it puts
 * it back. The library timers are module scope and outlive their component, so
 * one left armed would post into the next case.
 */
export function resetApp(mode: ViewMode): void {
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  cancelPendingSave()
  cancelNoticeFade()
  cancelFlash()
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.ui.select('board')
  state.ui.setAuto(false)
  state.ui.raiseClamped(false)
  state.lang.setLang('en')
  state.ui.setMode(mode)
  state.ui.setSolo(false)
  state.ui.setReport(false)
  state.ui.setSettings(true)
  state.ui.setSheet(null)
  state.ui.setMenu(false)
  state.ui.showBoards('list')
  state.ui.closePalette()
  state.ui.clearFocusRequest()
  state.ui.setBoardMode('view')
}

/** The real `App`, address bar and all. */
export function mountApp(mode: ViewMode = 'advanced') {
  resetApp(mode)
  return render(<App />)
}

/** The page carves on load; a case that measures or presses waits for that run first. */
export async function loadRunDone(): Promise<void> {
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
}
