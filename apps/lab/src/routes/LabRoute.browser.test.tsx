import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App, Shell } from '../App'
import { useStore } from '../state/store'

// The real App, address bar and all: Ruling 5's claim is about what App
// mounts, so a MemoryRouter harness would test the wrong thing.
async function mountApp() {
  window.history.pushState({}, '', '/')
  useStore.getState().run.reset()
  return render(<App />)
}

// Every test here states its own timeout, for the reason
// useGenerator.browser.test.tsx records: the chromium project sets no
// `testTimeout`, so Vitest's 5 s default would cut short polls that are budgeted
// for far longer, and the failure would name a timeout rather than the
// assertion. Each budget is the sum of that test's polls and fixed waits plus
// 8 s of headroom for a two-core, software-rendered CI runner. The two tests
// that carve nothing poll only through `expect.element` (1 s apiece), so their
// budget is dominated by mounting the shell and its WebGL canvas.

test('Generate carves a board, draws it, and says so', async () => {
  const errors: unknown[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args[0]))
  try {
    const screen = await mountApp()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Press "Generate".')

    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

    const element = screen.container.querySelector('arrowz-board')
    expect(element?.board?.pieces.length).toBeGreaterThan(0)
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Board closed/)

    // §8: a full run from Generate to a drawn board with zero console errors.
    expect(errors).toEqual([])
  } finally {
    spy.mockRestore()
  }
}, 40_000)

// The architectural claim of this PR, and the one §11.6 of the spec says was
// got wrong once already. Node identity is the assertion that matters: a
// remounted element is a disposed GL context, whatever the run's phase says.
// This half needs no run at all, so it is fast and never races.
test('a route change keeps the very same board element', async () => {
  const screen = await mountApp()
  const before = screen.container.querySelector('arrowz-board')
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  await expect.element(screen.getByRole('tabpanel', { name: 'Saved boards' })).toBeVisible()
  // Same node, still in the document, merely hidden.
  expect(screen.container.querySelector('arrowz-board')).toBe(before)

  await userEvent.click(screen.getByRole('tab', { name: 'Lab' }))
  expect(screen.container.querySelector('arrowz-board')).toBe(before)
}, 20_000)

// The other half: a run in flight survives the same trip. It needs a board big
// enough to still be carving after a Playwright click round-trip, which costs
// tens of milliseconds on its own; the defaults are 25×50 and finish in tens of
// milliseconds, so the shell is mounted directly with larger parameters. 600×600
// and not the brief's 200×200: Task 8 measured 200×200 at 228 ms in Chromium —
// a race the test would win while proving nothing — and settled on 600×600, at
// about 2.5 s, for exactly this margin.
test('a run in flight survives a route change', async () => {
  window.history.pushState({}, '', '/')
  useStore.getState().run.reset()
  const screen = await render(
    <BrowserRouter>
      <Shell params={{ ...defaultParams(), W: 600, H: 600, seed: 9 }} />
    </BrowserRouter>,
  )
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  // Still running right after the trip: nothing terminated the worker.
  expect(useStore.getState().run.phase).toBe('running')

  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.board?.W).toBe(600)
}, 40_000)

test('the lab panel is hidden off-route and shown on it', async () => {
  const screen = await mountApp()
  const panel = screen.container.querySelector('#lab-panel')
  expect(panel?.hasAttribute('hidden')).toBe(false)
  await userEvent.click(screen.getByRole('tab', { name: 'Docs' }))
  expect(screen.container.querySelector('#lab-panel')?.hasAttribute('hidden')).toBe(true)
}, 20_000)

test('a finished run is offered to the store and the outcome is appended', async () => {
  const screen = await mountApp()
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)
  // No store server answers in the browser test, so the outcome is a failure —
  // and the run's own outcome must survive beside it.
  expect(useStore.getState().run.phase).toBe('done')
  await expect.element(screen.getByRole('status')).toMatchTextContent(/not saved|saved/)
}, 40_000)
