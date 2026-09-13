import { defaultParams } from '@arrowz/engine'
import { StrictMode } from 'react'
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
// that carve nothing poll only through `expect.element`, so their budget is
// dominated by mounting the shell and its WebGL canvas.
//
// Every `expect.element` here states a 5 s timeout of its own, rather than
// taking the default and retrying into the test's budget. Each one runs after a
// poll has already settled the state it renders from, so it is waiting on one
// React commit, not on a carve — and a genuine regression in one of these lines
// then reports in seconds instead of burning the whole 40 s or 60 s first
// (measured: 60 s apiece before this).

test('Generate carves a board, draws it, and says so', async () => {
  const errors: unknown[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args[0]))
  try {
    const screen = await mountApp()
    await expect.element(screen.getByRole('status'), { timeout: 5_000 }).toHaveTextContent('Press "Generate".')

    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

    const element = screen.container.querySelector('arrowz-board')
    expect(element?.board?.pieces.length).toBeGreaterThan(0)
    await expect.element(screen.getByRole('status'), { timeout: 5_000 }).toMatchTextContent(/Board closed/)

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
//
// Probed, not assumed: with `/` changed to `element={<LabRoute …/>}` this test
// fails on the line below with `Received: null`, and it is the only test in the
// suite that does — see the note on the in-flight test.
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

// The other half: a run in flight survives the same trip, and its result still
// reaches the live element while the user is off-route. It needs a board big
// enough to still be carving after a Playwright click round-trip, which costs
// tens of milliseconds on its own; the defaults are 25×50 and finish in tens of
// milliseconds, so the shell is mounted directly with larger parameters. 600×600
// and not 200×200: Task 8 measured 200×200 at 228 ms in Chromium — a race this
// test would win while proving nothing — and settled on 600×600, at about 2.5 s,
// for exactly this margin. That size also buys the progress line, which the
// engine emits no sooner than 250 ms into a carve (Task 8 measured eight
// messages at 600×600 and none at 200×200).
//
// What this test does *not* guard, established by probe rather than by argument:
// the panel's placement. `useGenerator()` is mounted in `Shell`, above
// <Routes>, so the worker outlives a route change whether or not the panel is a
// route element — with `/` turned into `element={<LabRoute …/>}` this test still
// passes, unchanged, in 2 827 ms. The node-identity test above is the only one
// that catches that regression. What the two assertions at the end add is a
// claim that one makes on its own: a run that finishes while the user is
// off-route still lands on the same live element.
test('a run in flight survives a route change, and finishes into the same element', async () => {
  window.history.pushState({}, '', '/')
  useStore.getState().run.reset()
  const screen = await render(
    <BrowserRouter>
      <Shell params={{ ...defaultParams(), W: 600, H: 600, seed: 9 }} />
    </BrowserRouter>,
  )
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')

  // The only arithmetic in the panel, and the line a user stares at for the
  // length of a carve: `100 * (1 - remaining / total)`, with the two counts
  // abbreviated and the dictionary's <b> tags stripped.
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await expect
    .element(screen.getByRole('status'), { timeout: 5_000 })
    .toMatchTextContent(/^[\d.]+% · .* pieces · .* left/)

  const before = screen.container.querySelector('arrowz-board')
  expect(before).not.toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  // Still running right after the trip: nothing terminated the worker.
  expect(useStore.getState().run.phase).toBe('running')

  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.board?.W).toBe(600)
  // Still on /boards, and the board the worker just finished reached the same
  // element the run started with.
  expect(screen.container.querySelector('arrowz-board')).toBe(before)
  expect(before?.board?.W).toBe(600)
}, 60_000)

test('the lab panel is hidden off-route and shown on it', async () => {
  const screen = await mountApp()
  // `hidden` is on the <main> around the tabpanel, not on the panel itself:
  // the id has to stay on what the tab strip's aria-controls points at, which
  // is the tabpanel, as the other two panels have it. Moving the id back to
  // the <main> is caught by the `role` assertion alone: `#lab-panel` would
  // then be the <main>, whose role is not `tabpanel`. The `aria-controls`
  // assertion cannot catch it — it reads a string TabRow hard-codes in `TABS`
  // and passes wherever the id actually lives — but it is what pins the two
  // halves of the pair together, so a rename of the id on one side without the
  // other still fails here.
  const panel = screen.container.querySelector('#lab-panel')
  expect(panel?.getAttribute('role')).toBe('tabpanel')
  expect(screen.container.querySelector('#tab-lab-panel')?.getAttribute('aria-controls')).toBe('lab-panel')
  expect(panel?.closest('main')).not.toBeNull()
  expect(panel?.closest('main')?.hasAttribute('hidden')).toBe(false)
  await userEvent.click(screen.getByRole('tab', { name: 'Docs' }))
  expect(screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden')).toBe(true)
}, 20_000)

// Mounted under StrictMode, whose double-invoked mount effect is what the save
// guard's use of a ref rather than state is there to survive, and counting the
// POSTs rather than asserting `saved !== null` — which would be equally true of
// a run posted twice. `fetch` is spied on rather than stubbed, so the POST still
// goes out and still fails for real.
test('a finished run is offered to the store once per run, and the outcome is appended', async () => {
  window.history.pushState({}, '', '/')
  useStore.getState().run.reset()
  const fetchSpy = vi.spyOn(window, 'fetch')
  const posts = () => fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards')
  try {
    const screen = await render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    const generate = screen.getByRole('button', { name: 'Generate' })
    await generate.click()
    await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)
    // No store server answers in the browser test, so the outcome is a failure —
    // and the run's own outcome must survive beside it. The whole line is
    // asserted, not just the store's half: a status bar that *substituted* the
    // store's answer for the run's would match a looser pattern.
    expect(useStore.getState().run.phase).toBe('done')
    await expect
      .element(screen.getByRole('status'), { timeout: 5_000 })
      .toMatchTextContent(/^Board closed 100%\. — (not )?saved/)
    expect(posts()).toHaveLength(1)

    // The guard keys on the file object's identity, not on its value. Both
    // presses run the shell's one `DEFAULTS` object, so the second carves a
    // board equal to the first in every field, fingerprint included — a guard
    // that compared values would post once and swallow the second run.
    await generate.click()
    await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 20_000 }).toBe(true)
    expect(posts()).toHaveLength(2)
  } finally {
    fetchSpy.mockRestore()
  }
}, 60_000)

test('the lab route shows the console under the stage', async () => {
  const screen = await mountApp()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  await expect.element(screen.getByRole('tabpanel', { name: 'board' })).toBeVisible()
})

test('picking a rail entry replaces the panel', async () => {
  const screen = await mountApp()
  await screen.getByRole('tab', { name: 'skeleton', exact: true }).click()
  await expect.element(screen.getByText('number of skeleton pieces (0 = no skeleton)')).toBeVisible()
  await screen.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect.element(screen.getByRole('switch', { name: /round the corners/i })).toBeVisible()
})
