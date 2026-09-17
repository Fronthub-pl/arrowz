import { expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { cancelNoticeFade } from '../library/notices'
import { cancelPendingSave } from '../library/useViewSave'
import { useStore } from '../state/store'
import type { ViewMode } from '../state/ui.slice'

/**
 * Puts back everything a whole-app case can move, for the files this PR adds
 * (PR 4b, Ruling 11). The address first: a case that navigated must not leave
 * the next on /boards, and a fragment left behind would be read as a pasted
 * link — `replaceState` also clears `history.state`, where react-router keeps
 * its record. The view slice has no reset; a case that moves it puts it back.
 *
 * The two library timers as well: both are module scope, outliving whatever
 * component armed them (Ruling 12), so a case that edits a stored view or
 * raises a notice and ends before either fires can post into the next case
 * otherwise — whole-branch review finding 8.
 */
export function resetApp(mode: ViewMode): void {
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  cancelPendingSave()
  cancelNoticeFade()
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.ui.select('board')
  state.ui.setAuto(false)
  state.ui.setHelp(true)
  state.ui.raiseClamped(false)
  state.lang.setLang('en')
  state.ui.setMode(mode)
  state.ui.setSolo(false)
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
