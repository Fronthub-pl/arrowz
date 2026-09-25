import { afterEach, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { twoFrames } from '../harness/frames'
import { loadRunDone, mountApp, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'

afterEach(() => resetApp('advanced'))

/** Every run phase the store passes through while `act` runs; a carve is over within it. */
async function phasesDuring(act: () => Promise<void>): Promise<string[]> {
  const phases: string[] = []
  const unsubscribe = useStore.subscribe((state) => void phases.push(state.run.phase))
  await act()
  await twoFrames()
  unsubscribe()
  return phases
}

/** The page carved, the report drawer open behind the palette, the Abort row on screen. */
async function openOverReport(): Promise<HTMLElement> {
  await page.viewport(1400, 900)
  await mountApp()
  await loadRunDone()
  useStore.getState().ui.setReport(true)
  useStore.getState().ui.openPalette()
  await expect.poll(() => document.querySelector('#cmd-run-abort')).not.toBeNull()
  const abort = document.querySelector<HTMLElement>('#cmd-run-abort')
  if (abort === null) throw new Error('no abort row')
  return abort
}

// Desktop, because at XS `useDrawerKeys` leaves the drawers alone on Escape and
// the Escape half would pass with no fix.
it('a key pressed after a click inside the palette never reaches the page behind it', async () => {
  const abort = await openOverReport()
  // `force`: Playwright will not press an `aria-disabled` element.
  await userEvent.click(abort, { force: true })
  expect(await phasesDuring(() => userEvent.keyboard('g'))).not.toContain('running')
  await userEvent.keyboard('{Escape}')
  expect(useStore.getState().ui.palette).toBe(false)
  expect(useStore.getState().ui.report).toBe(true)
}, 40_000)

// The focus put on a row by hand reaches the frame's own key listener, which a
// press cannot: the `mousedown` listener keeps the focus in the input.
it('a key pressed with the focus on a row goes back to the input, not to the page', async () => {
  const abort = await openOverReport()
  abort.focus()
  expect(await phasesDuring(() => userEvent.keyboard('g'))).not.toContain('running')
  const input = document.querySelector<HTMLInputElement>('.fw-pal input')
  expect(document.activeElement).toBe(input)
  expect(useStore.getState().ui.report).toBe(true)
}, 40_000)
