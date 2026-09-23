import { defaultParams } from '@arrowz/engine'
import { MemoryRouter } from 'react-router'
import { act } from 'react'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { SETTINGS_ID, Stage } from './Stage'

/**
 * A parent that rerenders on every run message. Without it the second test
 * cannot fail: `Stage` alone has nothing above it to rerender, so the memo is
 * never asked the question the test is about.
 *
 * The router is the frame's and the report drawer's: both ask which tab is on
 * screen (`useInLibrary`). It sits inside the probe rather than around each
 * mount so that a rerender still goes through one router, and it names no
 * address — every case here is the lab. The settings drawer's content is a
 * stand-in carrying the id the handle names, with one control to hold a focus.
 */
function Probe() {
  useStore((state) => state.run.phase)
  useStore((state) => state.run.progress)
  return (
    <MemoryRouter>
      <Stage
        settings={
          <div id={SETTINGS_ID} className="fw-console">
            <button type="button">inside</button>
          </div>
        }
        run={null}
        side={null}
      />
    </MemoryRouter>
  )
}

const boardEl = (container: HTMLElement) => container.querySelector('arrowz-board')

test('editing a preview field redraws the board without generating', async () => {
  const screen = await render(<Probe />)
  const element = boardEl(screen.container)
  const before = element?.view
  useStore.getState().view.toggle('colored')
  await expect.poll(() => element?.view?.colored).toBe(true)
  // The run slice never moved: no worker was started.
  expect(useStore.getState().run.phase).toBe('idle')
  expect(element?.view).not.toBe(before)
  useStore.getState().view.toggle('colored')
})

// `boardViewOf(viewOf(view), view.voids)` takes the flag as a second argument,
// so `view.hilite` would type-check in its place and the whole suite would stay
// green — every other test here toggles `colored`. Voids is off and hilite is
// on by the end of this test, so the two cannot be swapped without it failing.
test('the voids flag reaches the element, and it is the voids flag', async () => {
  const screen = await render(<Probe />)
  const element = boardEl(screen.container)
  expect(element?.view?.voids).toBe(true)
  try {
    useStore.getState().view.toggle('voids')
    await expect.poll(() => element?.view?.voids).toBe(false)
    expect(useStore.getState().view.hilite).toBe(true)
  } finally {
    useStore.getState().view.toggle('voids')
  }
})

test('a progress message does not reassign the element view', async () => {
  const screen = await render(<Probe />)
  const element = boardEl(screen.container)
  const before = element?.view
  useStore.getState().run.started(defaultParams())
  useStore.getState().run.progressed({ pieces: 1, remaining: 9, backtracks: 0, ms: 12, total: 10 })
  // Let the rerender the probe just subscribed to actually happen.
  await expect.poll(() => useStore.getState().run.progress?.pieces).toBe(1)
  expect(element?.view).toBe(before)
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

// Handoff 2, PR 1: the settings handle mirrors the report's — it names the
// panel it controls (an id that exists, not the drawer holding the handle, as
// the reconstruction has it), says whether it is open, and advertises S.
test('the settings handle names its panel, its state and its key', async () => {
  useStore.getState().ui.setSettings(true)
  const screen = await render(<Probe />)
  const handle = screen.getByRole('button', { name: 'settings', exact: true })
  await expect.element(handle).toHaveAttribute('aria-expanded', 'true')
  await expect.element(handle).toHaveAttribute('aria-controls', SETTINGS_ID)
  await expect.element(handle).toHaveAttribute('aria-keyshortcuts', 'S')
  expect(document.getElementById(SETTINGS_ID)).not.toBeNull()
  expect(screen.container.querySelector('.fw-stage')?.classList.contains('ls-open')).toBe(true)
  await handle.click()
  await expect.element(handle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.container.querySelector('.fw-stage')?.classList.contains('ls-open')).toBe(false)
  useStore.getState().ui.setSettings(true)
})

// The report's pattern (spec §4.3): a focus left inside a drawer turning
// hidden would fall to <body>, so it moves to the handle.
test('closing the settings with the focus inside moves the focus to the handle', async () => {
  useStore.getState().ui.setSettings(true)
  const screen = await render(<Probe />)
  const inside = screen.getByRole('button', { name: 'inside' }).element()
  if (!(inside instanceof HTMLElement)) throw new Error('the stand-in control is missing')
  inside.focus()
  expect(document.activeElement).toBe(inside)
  await act(async () => useStore.getState().ui.setSettings(false))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'settings', exact: true }).element())
  useStore.getState().ui.setSettings(true)
})
