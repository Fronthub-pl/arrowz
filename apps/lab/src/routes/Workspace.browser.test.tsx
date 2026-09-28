import type { StoreRequest } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { act, StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone } from '../harness/mountApp'
import { cancelPendingSave } from '../library/useViewSave'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
// The stage-height case measures the lab grid, which needs the real cascade.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'

// The real App, address bar and all: the claims here are about what App mounts,
// so a MemoryRouter harness would test the wrong thing. The params slice is
// reset too: the store outlives a test.
async function mountApp() {
  // `pushState` leaves /boards behind and drops the fragment, which the next
  // mount would read as a pasted link and carve. `replaceState` clears
  // `history.state`, where react-router keeps its record, so each mount starts
  // from the blank entry a real page load has.
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().params.reset()
  // The whole `ui` slice: a case that turned `auto` on would otherwise carve on
  // the next case's first keystroke, and one that picked a rail entry leaves it
  // on 'preview'.
  useStore.getState().ui.select('board')
  // The saved boards' panel too: the restyle case leaves it on 'preview'.
  useStore.getState().ui.showBoards('list')
  useStore.getState().ui.setAuto(false)
  useStore.getState().ui.raiseClamped(false)
  useStore.getState().lang.setLang('en')
  useStore.getState().ui.setMode('advanced')
  // Solo too: two cases press `f`, and a solo left on takes `.fw-console` out
  // of the layout, so a later case would measure a `display: none` box.
  useStore.getState().ui.setSolo(false)
  useStore.getState().ui.setReport(false)
  useStore.getState().ui.setSettings(true)
  useStore.getState().ui.setSheet(null)
  useStore.getState().ui.setMenu(false)
  useStore.getState().ui.setBoardMode('view')
  return render(<App />)
}

/**
 * Whether the store has answered for a board other than `before`. `saved` alone
 * cannot say it: a run in flight keeps the last result and its answer, so right
 * after a press `saved` still describes the board before it.
 */
function savedAfter(before: unknown): boolean {
  const { shown, saved } = useStore.getState().result
  return shown !== null && shown.file !== before && saved !== null
}

/**
 * Every case that presses Generate or a run-column control opens at 1400×900:
 * at the runner's default 414px the run column is not beside the board. None of
 * these cases is about the width; LabLayout pins the narrow ones.
 */
async function clearOfTheDrawer(): Promise<void> {
  await page.viewport(1400, 900)
}

// `getByRole('status', { name: 'Run status' })`: the clamp notice is a second
// status region. Every test states its own timeout (the chromium project sets
// no `testTimeout`): its polls and waits plus 8 s for a two-core, software-
// rendered CI runner, and the load carve and WebGL canvas even with no run of
// its own. Every `expect.element` states 5 s: it waits on one React commit
// after a settled poll, so a regression reports in seconds, not after the budget.

test('Generate carves a board, draws it, and says so', async () => {
  await clearOfTheDrawer()
  const errors: unknown[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args[0]))
  try {
    const screen = await mountApp()
    // The lab opens on a board without being asked. Anchored at both ends,
    // because `toMatchTextContent` matches anywhere; only the store's answer may
    // follow, appended asynchronously, and `notSaved` has a parenthesis of its own.
    await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
    await expect
      .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
      .toMatchTextContent(/^Board complete: every cell filled\.(?: — (?:not )?saved.*)?$/)

    // The board the load run left, held so the press below can be told from it:
    // the page is already `done` when the click lands, so polling the phase
    // would pass with Generate's `onClick` deleted. `completeRun` gives
    // `result.shown` a new file object, so a new file proves a run after the press.
    const onLoad = useStore.getState().result.shown?.file
    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect
      .poll(
        () => {
          const file = useStore.getState().result.shown?.file
          return file !== undefined && file !== onLoad
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    expect(useStore.getState().run.phase).toBe('done')

    const element = screen.container.querySelector('arrowz-board')
    expect(element?.board?.pieces.length).toBeGreaterThan(0)
    await expect
      .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
      .toMatchTextContent(/Board complete/)

    // A full run from Generate to a drawn board with zero console errors.
    expect(errors).toEqual([])
  } finally {
    spy.mockRestore()
  }
}, 40_000)

// Node identity is the assertion that matters: a remounted element is a
// disposed GL context, whatever the run's phase says. This half needs no run at
// all, so it is fast and never races. It is the only test that fails if `/`
// renders the workspace as a route element.
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

// A run in flight survives the same trip, and its result still reaches the live
// element while the user is off-route. 600×600, about 2.5 s: 200×200 finishes
// in about 228 ms, a race the click round-trip would win while proving
// nothing, and the engine emits no progress before 250 ms. The worker lives in
// `Shell`, above <Routes>, so this case alone does not guard the panel's
// placement; the node-identity case above does.
test('a run in flight survives a route change, and finishes into the same element', async () => {
  await clearOfTheDrawer()
  const screen = await mountApp()
  // The load run first: Generate is disabled while a run carves, so `click()`
  // would wait out the load run and report a timeout, not a broken button.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')

  // The only arithmetic in the panel, and the line a user stares at for the
  // length of a carve: `100 * (1 - remaining / total)`, with the two counts
  // abbreviated and the dictionary's <b> tags stripped.
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await expect
    .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
    .toMatchTextContent(/^[\d.]+% · .* arrows · .* left/)

  const before = screen.container.querySelector('arrowz-board')
  expect(before).not.toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  // Still running right after the trip: nothing terminated the worker.
  expect(useStore.getState().run.phase).toBe('running')

  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().result.shown?.board.W).toBe(600)
  // Still on /boards: the element the run started with is still the one on the
  // page, not an equal-looking replacement.
  expect(screen.container.querySelector('arrowz-board')).toBe(before)
  // Back to the lab before reading the element: on the library tab the frame
  // shows the preview or nothing, so the run's board is deliberately not there.
  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => before?.board?.W).toBe(600)
}, 60_000)

// The board is replaced only when a run is done; the stage never sits empty
// for a carve. 600×600 and seed 9 for the reason the case above gives.
test('a run in flight keeps the last result on screen', async () => {
  await clearOfTheDrawer()
  const screen = await mountApp()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  const element = screen.container.querySelector('arrowz-board')
  const board = element?.board
  expect(board?.W).toBe(25)
  // `includeHidden`: the report drawer starts closed and its report is then
  // `visibility: hidden`, which a role locator skips. The claim is what the
  // report holds while a run is in flight, not whether the drawer is open.
  const report = () =>
    screen.getByRole('region', { name: 'Report', includeHidden: true }).element().querySelector('table.fw-stats')
  const statsBefore = report()?.textContent
  expect(statsBefore).toMatch(/25 × 50/)
  // The board-file button waits for the layout hash of the board on screen;
  // the synchronous read below is about the run, not about that wait.
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeEnabled()
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  // The status line, not the store: the commit that renders `running` is the
  // one that would have taken the board off the element.
  await expect
    .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
    .toMatchTextContent(/^(Generating|[\d.]+%)/)
  expect(element?.board).toBe(board)
  expect(report()?.textContent).toBe(statsBefore)
  // Both exports stay live for the board on screen while the next one carves.
  // Read at once, not retried: a retrying `toBeEnabled` outlasts the carve and
  // would pass a button disabled while running.
  expect(useStore.getState().run.phase).toBe('running')
  for (const name of ['Download SVG', 'Download board file']) {
    const button = screen.getByRole('button', { name }).element()
    if (!(button instanceof HTMLButtonElement)) throw new Error(`${name} is not a button`)
    expect(button.disabled, name).toBe(false)
  }
  // Kept through the carve as well.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(element?.board?.W).toBe(600)
}, 40_000)

test('the lab panel is hidden off-route and shown on it', async () => {
  const screen = await mountApp()
  // `hidden` is on the <main> around the tabpanel; the id stays on the tabpanel,
  // which the tab strip's aria-controls points at. The `role` assertion catches
  // an id moved to the <main>; the `aria-controls` one pins the two halves of
  // the pair together, so renaming one side alone still fails here.
  const panel = screen.container.querySelector('#lab-panel')
  expect(panel?.getAttribute('role')).toBe('tabpanel')
  expect(screen.container.querySelector('#tab-lab-panel')?.getAttribute('aria-controls')).toBe('lab-panel')
  expect(panel?.closest('main')).not.toBeNull()
  expect(panel?.closest('main')?.hasAttribute('hidden')).toBe(false)
  await userEvent.click(screen.getByRole('tab', { name: 'Docs' }))
  // Polled: `BrowserRouter` commits every location change inside
  // `startTransition` (App does not pass `useTransitions={false}`), so `hidden`
  // lands after the click; a synchronous read passes only on a fast runner.
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'), {
      timeout: 5_000,
    })
    .toBe(true)
}, 20_000)

// Under StrictMode, whose double-invoked mount effect is what the save guard's
// ref survives. Counting the POSTs, because `saved !== null` holds for a run
// posted twice too. `fetch` is spied on, not stubbed, so the POST still fails for real.
test('a finished run is offered to the store once per run, and the outcome is appended', async () => {
  await clearOfTheDrawer()
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  // Not through `mountApp`, which renders `App` bare: the defaults have to be
  // put back here too, or this test carves whatever the last one left behind.
  useStore.getState().params.reset()
  useStore.getState().ui.select('board')
  useStore.getState().ui.setAuto(false)
  useStore.getState().ui.raiseClamped(false)
  useStore.getState().lang.setLang('en')
  useStore.getState().ui.setMode('advanced')
  useStore.getState().ui.setBoardMode('view')
  const screen = await render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  // The page carves on load, and that run posts too. Its POST is awaited here
  // rather than counted, so the spy is installed on a quiet page and the counts
  // below are this test's own presses, whenever the load save lands.
  await expect.poll(() => useStore.getState().result.saved !== null, { timeout: 30_000 }).toBe(true)
  const fetchSpy = vi.spyOn(window, 'fetch')
  // The method is part of the predicate: `listBoards()` GETs this same address,
  // and an address-only filter would count that as a save.
  const posts = () =>
    fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards' && call[1]?.method === 'POST')
  try {
    const generate = screen.getByRole('button', { name: 'Generate' })
    const loaded = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)
    // No store server answers in the browser test, so the outcome is a failure,
    // and the run's own outcome must survive beside it. The whole line is
    // asserted: a bar that *substituted* the store's answer would match less.
    expect(useStore.getState().run.phase).toBe('done')
    await expect
      .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
      .toMatchTextContent(/^Board complete: every cell filled\. — (not )?saved/)
    expect(posts()).toHaveLength(1)

    // The guard keys on the file object's identity, not its value: the second
    // press carves a board equal to the first in every field, so a value guard
    // would post once and swallow the second run.
    const first = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(first), { timeout: 20_000 }).toBe(true)
    expect(posts()).toHaveLength(2)
  } finally {
    fetchSpy.mockRestore()
  }
}, 60_000)

// The switch reaches three places no component test can see together: the
// document's own `lang` (what a screen reader pronounces with), the board
// element's `lang` (its control bar has its own dictionary), and a label far
// from the top bar.
test('the language switch reaches the document, the board and every label', async () => {
  const screen = await mountApp()
  await screen.getByRole('radio', { name: 'PL' }).click()
  await expect.element(screen.getByRole('button', { name: 'Generuj' })).toBeInTheDocument()
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('pl'))
  // `@lit/react` sets the property, and `HTMLElement.lang` reflects it.
  await vi.waitFor(() => expect(screen.container.querySelector('arrowz-board')?.getAttribute('lang')).toBe('pl'))
  await screen.getByRole('radio', { name: 'EN' }).click()
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('en'))
}, 40_000)

// The console is the settings drawer's content on the lab, not a row under the stage.
test('the lab route shows the console in the settings drawer', async () => {
  const screen = await mountApp()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  await expect.element(screen.getByRole('tabpanel', { name: 'board' })).toBeVisible()
  expect(
    screen.getByRole('tablist', { name: 'Parameter groups' }).element().closest('.fw-stage > .fw-ldrawer'),
  ).not.toBeNull()
})

// The ref plumbing, on the real page: `ClampNotice` and `RunColumn` are each
// tested against a host of their own, so both suites stay green with
// `abortRef` or `goRef` cut between `Workspace` and `RunColumn`. Focus is the
// one thing a component test cannot fake: the buttons here are reached by
// role, so the assertion holds only if the ref arrived at the button the page renders.
test('the clamp notice hands focus to the route’s own buttons', async () => {
  await clearOfTheDrawer()
  const screen = await mountApp()
  // The load run first: Generate is disabled while it carves, and the idle
  // half below is about Generate being the live one.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

  // `goRef`. `act`, because `raiseClamped` is a store write from outside a
  // React event and the Dismiss button is not in the DOM until it commits.
  await act(async () => useStore.getState().ui.raiseClamped(true))
  await screen.getByRole('button', { name: 'Dismiss' }).click()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element())

  // `abortRef`: with a carve in flight Generate is refused and Abort is live.
  // 600×600 and seed 9 for the reason the in-flight case gives.
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')
  await act(async () => useStore.getState().ui.raiseClamped(true))
  await screen.getByRole('button', { name: 'Dismiss' }).click()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())

  // The end of the run does not take that focus down with it: `RunColumn`
  // moves it to Generate, re-enabled in the same commit. `vi.waitFor`, not a
  // bare read: the redirect is a layout effect racing HTML's own focus fixup.
  await screen.getByRole('button', { name: 'Abort' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('idle')
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element()),
  )
}, 60_000)

test('picking a rail entry replaces the panel', async () => {
  const screen = await mountApp()
  await screen.getByRole('tab', { name: 'skeleton', exact: true }).click()
  // The knob row's label is the short term.
  const label = screen.container.querySelector<HTMLElement>('label[for="knob-giants"]')
  if (label === null) throw new Error('label not found')
  expect(label.textContent).toBe('skeletons')
  await expect.element(label).toBeVisible()
  await screen.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect.element(screen.getByRole('switch', { name: 'rounded' })).toBeVisible()
})

test('Generate is refused while a rule is broken, and the reasons are on screen', async () => {
  const screen = await mountApp()
  // The load run has to be over before the rule is broken: `RunColumn` disables
  // Generate for either, so `toBeDisabled` would pass on the run.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
  const generate = screen.getByRole('button', { name: 'Generate' })
  await expect.element(generate).toBeDisabled()
  await expect.element(generate).toHaveAttribute('title', 'Fix the settings marked in red to generate')
  await expect.element(screen.getByRole('region', { name: 'Settings outside the safe range' })).toBeVisible()
  useStore.getState().params.reset()
  await expect.element(generate).toBeEnabled()
  // A budget of its own, like every other case here: this one holds a 30 s poll.
}, 40_000)

test('a board carved from the console reaches the element and the store', async () => {
  await clearOfTheDrawer()
  const screen = await mountApp()
  // The load run first: Generate is disabled while it carves, and the click
  // below would spend its actionability wait on it.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  // 600×600 for the reason given above the in-flight test.
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.params?.W).toBe(600)
}, 40_000)

test('the knobs on screen are the knobs the run used', async () => {
  await clearOfTheDrawer()
  const screen = await mountApp()
  // The load run first, for the reason the case above gives.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  // 'board' exactly: the route strip has a tab called "Saved boards".
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  // Commit a seed through the console itself, not through the store.
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.fill(screen.getByRole('textbox'), '42')
  await userEvent.keyboard('{Enter}')
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.params?.seed).toBe(42)
}, 40_000)

// The saved board carries the view it was drawn with. `DEFAULT_VIEW` is close
// to the lab's starting view, so this test moves a field. Read off the POST
// body, not `result.saved`, which says only that the store answered.
test('the saved board carries the view on screen', async () => {
  await clearOfTheDrawer()
  // The view slice has no reset, so this test puts back what it moved.
  const was = { colored: useStore.getState().view.colored, stroke: useStore.getState().view.stroke }
  const screen = await mountApp()
  // The load run's own save is awaited before the spy goes on, as in the
  // StrictMode case; the length assertion below still says which POST this is.
  await expect.poll(() => useStore.getState().result.saved !== null, { timeout: 30_000 }).toBe(true)
  const fetchSpy = vi.spyOn(window, 'fetch')
  try {
    await screen.getByRole('tab', { name: 'Preview', exact: true }).click()
    // The preview's rows name their switches by the short term.
    await screen.getByRole('switch', { name: 'multicolour' }).click()
    // A second field, and a number rather than a flag: one boolean surviving
    // the trip says less than "the view the user was looking at survived it".
    useStore.getState().view.setNumber('stroke', '0.8')
    const loaded = useStore.getState().result.shown?.file
    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)

    // Filtered, not `find`: earlier tests never await their own save, so a POST
    // of theirs can land inside this spy's window.
    const posts = fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards' && call[1]?.method === 'POST')
    expect(posts).toHaveLength(1)
    const request = JSON.parse(String(posts[0]?.[1]?.body)) as StoreRequest
    expect(request.view.colored).toBe(true)
    expect(request.view.stroke).toBe(0.8)
    // The highlight is on and set to 5 pieces, and a stored board keeps none of it.
    expect(useStore.getState().view.top).toBe(5)
    expect(request.view.top).toBe(0)
    // The cell a viewer opens the file at is the run's own, as `carve` computes
    // it (`exportCell`), not the slice's starting 12, which nothing moves.
    expect(request.view.cell).toBe(exportCell(25, 50))
    expect(request.view.cell).not.toBe(12)
  } finally {
    fetchSpy.mockRestore()
    if (useStore.getState().view.colored !== was.colored) useStore.getState().view.toggle('colored')
    useStore.getState().view.setNumber('stroke', String(was.stroke))
  }
}, 40_000)

// The run column survives a switch to the simple view as the same node: a
// remount would lose the focus a keyboard user left on Generate, and the
// column's `wasRunning` ref. Looked up once before the swap, compared by
// identity after it. `Console` moving `children` to another position turns it red.
test('the simple view replaces the rail and the presets, and keeps the very same run column', async () => {
  const screen = await mountApp()
  const column = screen.getByRole('region', { name: 'Run' }).element()
  // Present in the advanced view first, so the null check below cannot pass on
  // a trigger the locator never matched.
  await expect.element(screen.getByRole('button', { name: /^preset/ })).toBeInTheDocument()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  expect(screen.getByRole('tablist', { name: 'Parameter groups' }).query()).toBeNull()
  // The trigger, not the `Presets` group: that group is the picker's panel,
  // hidden while closed, so it is absent from the role tree either way.
  expect(screen.getByRole('button', { name: /^preset/ }).query()).toBeNull()
  expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
  await screen.getByRole('radio', { name: 'Advanced' }).click()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
}, 40_000)

// `auto` belongs to the knobs, and the simple view shows no knobs.
test('the simple view hides the switch only the advanced view has', async () => {
  const screen = await mountApp()
  await expect.element(screen.getByRole('switch', { name: 'generate right after a change' })).toBeInTheDocument()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  expect(screen.getByRole('switch', { name: 'generate right after a change' }).query()).toBeNull()
  await expect.element(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument()
}, 40_000)

// Without its first row the lab grid would auto-place the stage into the
// `auto` track. Measured on the element the grid actually sizes.
test('the stage keeps its height when the preset strip goes', async () => {
  const screen = await mountApp()
  const stage = () => screen.container.querySelector<HTMLElement>('.fw-stage')?.getBoundingClientRect().height ?? 0
  await expect.poll(stage).toBeGreaterThanOrEqual(180)
  const before = stage()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  // Not a 180px floor: at the runner's 414×896 an auto-placed stage still
  // measures 292px, so the floor could not fail. The strip's row goes to the
  // two remaining rows, so the stage can only grow.
  await expect.poll(stage).toBeGreaterThanOrEqual(before)
}, 40_000)

// One panel serves both tabs and renames itself with the route, because the tab
// strip resolves `aria-controls` to that id. Two parallel panels could not both
// hold the one stage.
test('the panel takes the identity of the tab that is open', async () => {
  const screen = await mountApp()
  const panel = () => screen.container.querySelector('[role="tabpanel"]')
  expect(panel()?.id).toBe('lab-panel')
  expect(panel()?.getAttribute('aria-labelledby')).toBe('tab-lab-panel')

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))

  await expect.poll(() => panel()?.id).toBe('boards-panel')
  expect(panel()?.getAttribute('aria-labelledby')).toBe('tab-boards-panel')
})

// The whole point of the workspace: the element is never unmounted, so its GL
// context is never disposed. Node identity, not a count.
test('the board element survives the trip to the library and back', async () => {
  const screen = await mountApp()
  const element = () => screen.container.querySelector('arrowz-board')
  const before = element()
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
  expect(element()).toBe(before)

  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('lab-panel')
  expect(element()).toBe(before)
})

// The preset strip goes, the stage stays: the same node, not merely a node in
// the same place. Not the index: a React `null` slot renders no DOM node, so
// the stage's index among `.fw-lab.children` drops from 1 to 0 while it holds.
test('the preset strip is absent from the library and the stage is the same node', async () => {
  const screen = await mountApp()
  const stage = () => screen.container.querySelector('.fw-stage')
  const before = stage()
  expect(before).not.toBeNull()
  // Established before the click, so the case does not rest on `mountApp`'s
  // `setMode('advanced')` staying the default.
  expect(screen.container.querySelector('.fw-presets')).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  expect(screen.container.querySelector('.fw-presets')).toBeNull()
  expect(stage()).toBe(before)
})

// The docs are not the workspace: there the panel is hidden.
test('the workspace is hidden under the docs route', async () => {
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Docs', exact: true }))
  await expect
    .poll(() => screen.container.querySelector('main[hidden] [role="tabpanel"]')?.id, { timeout: 5_000 })
    .toBe('lab-panel')
}, 40_000)

// The run column is hidden in the library, not replaced, so a carve started in
// the lab keeps its node, its refs and the run. Read with `querySelector`: a
// role locator skips `display: none`, the state under test. 1400 wide, because
// at 414 the ≤900px rule already yields two tracks and the assertion would pass
// without the library rule. `fetch` is mocked: unmocked, a race with
// `listError` collapses the console to one track.
test('the run column stays mounted, and hidden, in the library', async () => {
  await page.viewport(1400, 900)
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [] }]))
    }
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  try {
    const screen = await mountApp()
    const column = () => screen.container.querySelector('.fw-run-col')
    const before = column()
    expect(before).not.toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
    await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
    await expect.poll(() => useStore.getState().library.sizes?.length).toBe(1)

    const after = column()
    expect(after).toBe(before)
    if (!(after instanceof HTMLElement)) throw new Error('the run column is not an HTML element')
    expect(getComputedStyle(after).display).toBe('none')
    // And the console gives its width to the two tracks that are left: a hidden
    // grid item takes no track.
    const consoleBox = screen.container.querySelector('.fw-console')
    if (!(consoleBox instanceof HTMLElement)) throw new Error('the console is not on the page')
    expect(getComputedStyle(consoleBox).gridTemplateColumns.split(' ')).toHaveLength(2)
  } finally {
    vi.restoreAllMocks()
  }
})

// The library has no preset strip, and the lab grid's first row is `auto`:
// without `.fw-lab.library` the stage takes 590px and the console is left with
// its 180px minimum. The same trap `.fw-lab.simple` avoids, asserted the same
// way: by the two rows being the halves they are in the lab.
test('the library gives the console its share of the panel', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  const box = (selector: string) => {
    const found = screen.container.querySelector(selector)
    if (found === null) throw new Error(`${selector} is not on the page`)
    return found.getBoundingClientRect()
  }
  const stage = box('.fw-stage')
  const consoleBox = box('.fw-console')
  expect(consoleBox.height).toBeGreaterThan(300)
  expect(Math.abs(stage.height - consoleBox.height)).toBeLessThan(2)
})

// Solo is the stage's, not the lab tab's: the full view works on both tabs.
// The `f` key is the application's, so this presses it. The viewport is stated,
// because `page.viewport` outlives the case that sets it; 1400×900 puts the
// console on screen for solo to take away.
test('solo works on the saved boards tab too', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  await userEvent.keyboard('f')
  await expect.poll(() => useStore.getState().ui.solo).toBe(true)
  const lab = screen.container.querySelector('.fw-lab')
  expect(lab?.classList.contains('solo')).toBe(true)

  await userEvent.keyboard('f')
  await expect.poll(() => useStore.getState().ui.solo).toBe(false)
}, 40_000)

// `useStoredBoard` is mounted in `Workspace` because `Console` unmounts the
// library panel, so a hook there never cleared the preview and the lab went on
// showing a board read off the disk. The board must be opened through the
// address, not `showPreview`: the clearing effect keys on the address, so a
// preview put there by hand would pass with the hook in the wrong place.
test('leaving the library takes the stored board off the stage', async () => {
  const { meta, file } = storedFixture(4)
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [meta] }]))
    }
    if (url.includes(meta.id)) return Promise.resolve(Response.json(file))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  try {
    // 1400×900: at 414×896 the stage overlaps the row this case clicks, and
    // Playwright refuses the click as intercepted by `<arrowz-board>`.
    await page.viewport(1400, 900)
    const screen = await mountApp()
    await loadRunDone()
    const runAnnotation = screen.container.querySelector('.fw-anno')?.textContent

    await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
    // A row prints a short id and carries the whole one in its title.
    await expect.element(screen.getByTitle(meta.id)).toBeVisible()
    await userEvent.click(screen.getByTitle(meta.id))
    await expect.poll(() => screen.container.querySelector('.fw-anno')?.textContent).toBe('8×8 · seed 4')
    // The report is the stored board's: its six stored figures, not the run's 23 rows.
    await expect
      .poll(() => screen.container.querySelector('.fw-report table.fw-stats')?.querySelectorAll('tr').length)
      .toBe(6)

    await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
    await expect.poll(() => useStore.getState().result.preview).toBeNull()
    expect(screen.container.querySelector('.fw-anno')?.textContent).toBe(runAnnotation)
    await expect
      .poll(() => screen.container.querySelector('.fw-report table.fw-stats')?.querySelectorAll('tr').length)
      .toBeGreaterThan(6)
  } finally {
    vi.restoreAllMocks()
  }
}, 40_000)

// `.fw-lab.library.solo` is load-bearing and only geometry measures it: the
// solo case reads `ui.solo` and a class name, which survive the rule's
// deletion, and without it `.fw-lab.library` beats `.fw-lab.solo` on order.
test('solo in the library fills the panel', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
  await userEvent.keyboard('f')
  await expect.poll(() => useStore.getState().ui.solo).toBe(true)

  const box = (selector: string) => {
    const found = screen.container.querySelector(selector)
    if (found === null) throw new Error(`${selector} is not on the page`)
    return found.getBoundingClientRect()
  }
  const lab = box('.fw-lab')
  const wrap = box('.fw-boardwrap')
  const element = box('arrowz-board')
  expect(wrap.width).toBeCloseTo(lab.width, 0)
  expect(wrap.height).toBeCloseTo(lab.height, 0)
  expect(element.width).toBeCloseTo(lab.width - 34, 0)
  // The annotation strip holds its height here too; read it rather than pin
  // it, since the touch breakpoint makes it 44px instead of 30.
  const frame = screen.container.querySelector('.fw-board')
  if (frame === null) throw new Error('.fw-board is not on the page')
  const annoStrip = parseFloat(getComputedStyle(frame).paddingTop)
  expect(element.height).toBeCloseTo(lab.height - 34 - annoStrip, 0)
}, 40_000)

// The saved boards' rail is the lab's rail in the same drawer, so below 900px
// both are the drawer's 126px. It needs the same mocked listing as the case
// above: a listing that settles as an error would measure a different face.
test('below 900px the library rail is the lab rail', async () => {
  await page.viewport(860, 900)
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [] }]))
    }
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  try {
    const screen = await mountApp()
    await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
    await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
    await expect.poll(() => useStore.getState().library.sizes?.length).toBe(1)
    const consoleBox = screen.container.querySelector('.fw-console')
    if (!(consoleBox instanceof HTMLElement)) throw new Error('the console is not on the page')
    // The drawer's rail, the lab's own at this width (126px).
    expect(getComputedStyle(consoleBox).gridTemplateColumns.split(' ')[0]).toBe('126px')
  } finally {
    vi.restoreAllMocks()
  }
}, 40_000)

// The detail through the real application: a row opens a board, the detail
// describes it, an edited field redraws it and reaches the store, and the
// address survives all of it. The store is stubbed — `boards.node.test.ts` is
// where a real one is exercised.
test('a stored board can be opened, restyled and loaded back into the lab', async () => {
  // Its own viewport, because the one before it outlives its case: at 414×896
  // Playwright refuses row clicks as intercepted by `<arrowz-board>`.
  await page.viewport(1400, 900)
  const { meta, file } = storedFixture(1)
  const sizes = [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [meta] }]
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(meta), { status: 201 }))
    if (url.includes('/api/boards')) return Promise.resolve(new Response(JSON.stringify(sizes), { status: 200 }))
    if (url.includes('/store/')) return Promise.resolve(new Response(JSON.stringify(file), { status: 200 }))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  try {
    const screen = await mountApp()
    await loadRunDone()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
    // Wait for the rows: the tab click navigates, and a navigation commits
    // inside `startTransition`, so a synchronous read fails.
    await expect.poll(() => screen.container.querySelector('.fw-brow')).not.toBeNull()
    const row = screen.container.querySelector<HTMLElement>('.fw-brow')
    if (row === null) throw new Error('the listing showed no row')
    await userEvent.click(row)

    // The detail describes the board the address names.
    await expect.element(screen.getByText(meta.command)).toBeVisible()
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)

    // An edited field in the drawer's Preview panel redraws the stored board
    // without generating anything.
    const phase = useStore.getState().run.phase
    await userEvent.click(screen.getByRole('tab', { name: 'Preview', exact: true }))
    await screen.getByRole('button', { name: /^thickness:/ }).click()
    await userEvent.fill(screen.getByRole('textbox', { name: 'thickness', exact: true }), '0.9')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => useStore.getState().result.preview?.meta.view.stroke).toBe(0.9)
    expect(useStore.getState().run.phase).toBe(phase)

    // The lab's own board is waiting where it was left: *this* board, not some
    // board. `shown` is non-null here however Load into lab behaves, so only
    // identity against the value captured first goes red if Load into lab
    // overwrote the lab's result with the stored board's.
    const labBoard = useStore.getState().result.shown
    expect(labBoard).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
    await expect.element(screen.getByRole('tab', { name: 'Lab', exact: true })).toHaveAttribute('aria-selected', 'true')
    expect(useStore.getState().result.shown).toBe(labBoard)
  } finally {
    // The stroke edit above leaves a 350ms module-scope save timer running, and
    // its `.then` calls `refresh()` after the case is gone.
    cancelPendingSave()
    vi.restoreAllMocks()
  }
}, 40_000)

// At 860x900 the long list scrolls inside the drawer, and the open board's
// actions stay on screen in the right column.
test('at 860x900 the list scrolls in the drawer and the column keeps its actions on screen', async () => {
  await page.viewport(860, 900)
  const { meta, file } = storedFixture(1)
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...meta,
    id: `${meta.id.slice(0, -2)}${String(i).padStart(2, '0')}`,
  }))
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(
        new Response(JSON.stringify([{ size: '8x8', W: 8, H: 8, cells: 64, boards: many }]), { status: 200 }),
      )
    }
    if (url.includes('/store/')) return Promise.resolve(new Response(JSON.stringify(file), { status: 200 }))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  try {
    const screen = await mountApp()
    await loadRunDone()
    await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
    // Wait for the rows: the tab click navigates, and a navigation commits
    // inside `startTransition`, so a synchronous read fails.
    await expect.poll(() => screen.container.querySelector('.fw-brow')).not.toBeNull()
    const row = screen.container.querySelector<HTMLElement>('.fw-brow')
    if (row === null) throw new Error('the listing showed no row')
    await userEvent.click(row)
    await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()

    const list = screen.container.querySelector<HTMLElement>('.fw-blist')
    if (list === null) throw new Error('the library face is incomplete')
    expect(list.clientHeight).toBeGreaterThanOrEqual(120)
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
    expect(getComputedStyle(list).overflowY).toBe('auto')
    // The buttons themselves, not the box that contains them: `toBeVisible()`
    // says nothing about a button below the window.
    for (const name of [/load into lab/i, /delete from disk/i]) {
      const button = screen.getByRole('button', { name }).element()
      expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
    }
    // And nothing pushed the document itself out of shape.
    expect(
      document.scrollingElement === null
        ? 0
        : document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
    ).toBe(0)
  } finally {
    vi.restoreAllMocks()
  }
}, 40_000)
