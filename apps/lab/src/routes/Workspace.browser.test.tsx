import type { StoreRequest } from '@arrowz/engine'
import { exportCell } from '@arrowz/engine/simple'
import { act, StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone } from '../harness/mountApp'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
// The stage-height case measures the lab grid, which needs the real cascade,
// in the order `main.tsx` loads it.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'

// The real App, address bar and all: Ruling 5's claim is about what App
// mounts, so a MemoryRouter harness would test the wrong thing. The params
// slice is reset alongside the run: the store outlives a test, and the sizes
// one test commits would otherwise be what the next one carves.
async function mountApp() {
  // `pushState` does two things: a case that navigated to /boards must not
  // leave the next one there, and it drops the fragment — `useUrlHash` writes
  // the knobs into it, and a link left behind by one case would be read as a
  // pasted one by the next mount, which now carves a board on load. The
  // `replaceState` on the line below adds one thing only: it clears
  // `history.state`, where react-router keeps its own record, so each mount
  // starts from the blank entry a real page load has.
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().params.reset()
  // The whole `ui` slice, not a selection of it, and the load run makes it
  // matter: a case that turned `auto` on would otherwise carve on the next
  // case's first keystroke. `entry` is reset for the same reason the others
  // are — the case that picks a rail entry leaves it on 'preview'.
  useStore.getState().ui.select('board')
  useStore.getState().ui.setAuto(false)
  useStore.getState().ui.setHelp(true)
  useStore.getState().ui.raiseClamped(false)
  useStore.getState().lang.setLang('en')
  useStore.getState().ui.setMode('advanced')
  // Solo is reset here for the same reason `auto` is, and the harness's own
  // `resetApp` already does it: the two cases at the foot of this file press
  // `f`, and the store outlives a case, so a solo left on would hide the
  // console from whatever ran next — `.fw-lab.solo` takes it out of the layout
  // entirely (console.css), and a later case reading `.fw-console` would then
  // be measuring a `display: none` box.
  useStore.getState().ui.setSolo(false)
  return render(<App />)
}

/**
 * Whether the store has answered for a board other than `before`. `saved` alone
 * cannot say it: a run in flight keeps the last result and its answer (PR 4b),
 * so right after a press `saved` still describes the board before it.
 */
function savedAfter(before: unknown): boolean {
  const { shown, saved } = useStore.getState().result
  return shown !== null && shown.file !== before && saved !== null
}

// `getByRole('status', { name: 'Run status' })` and not the bare role: the lab
// route holds two status regions — the run status bar and the clamp notice —
// and only the name tells them apart.
//
// Every test here states its own timeout, for the reason
// useGenerator.browser.test.tsx records: the chromium project sets no
// `testTimeout`, so Vitest's 5 s default would cut short polls that are budgeted
// for far longer, and the failure would name a timeout rather than the
// assertion. Each budget is the sum of that test's polls and fixed waits plus
// 8 s of headroom for a two-core, software-rendered CI runner. No test carves
// nothing any more — the page carves on load — so the two that start no run of
// their own still pay for the default 25×50 board on top of mounting the shell
// and its WebGL canvas, which is what dominates their budget.
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
    // §2.2's last row, proven in the real shell: the lab opens on a board
    // without being asked. This is what the page says on load now, and it says
    // more than the `Press "Generate".` it replaces — that line only claimed
    // the page had not run, while this one claims a run finished and closed.
    //
    // Anchored at both ends, because `toMatchTextContent` matches anywhere in
    // the content while the `toHaveTextContent` it replaces compared the whole
    // of it (@vitest/browser 5: `pass: received === expected`). Nothing may
    // precede the run's own report and nothing may follow it but the store's
    // answer, which is optional and open-ended: it is appended asynchronously,
    // so this line can run before or after it lands, and `notSaved` carries a
    // parenthesis of its own (lab-i18n.ts:172).
    await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
    await expect
      .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
      .toMatchTextContent(/^Board closed 100%\.(?: — (?:not )?saved.*)?$/)

    // The board the load run left, held so the press below can be told from
    // it. Polling the phase alone would not do it: the page is already `done`
    // when the click lands, so every assertion after it would be satisfied by
    // the load board — delete `onClick={control.start}` from `RunColumn` and
    // this case would stay green, which is the one failure a gate must never
    // have. `completeRun` gives `result.shown` the new run's own file object, so
    // a file that is new is proof a run finished after the press.
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
      .toMatchTextContent(/Board closed/)

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
// Probed, not assumed: with `/` changed to `element={<Workspace …/>}` this test
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
// milliseconds, so the console commits a larger board before the run. 600×600 and
// not 200×200: Task 8 measured 200×200 at 228 ms in Chromium — a race this test
// would win while proving nothing — and settled on 600×600, at about 2.5 s, for
// exactly this margin. That size also buys the progress line, which the
// engine emits no sooner than 250 ms into a carve (Task 8 measured eight
// messages at 600×600 and none at 200×200).
//
// What this test does *not* guard, established by probe rather than by argument:
// the panel's placement. `useGenerator()` is mounted in `Shell`, above
// <Routes>, so the worker outlives a route change whether or not the panel is a
// route element — with `/` turned into `element={<Workspace …/>}` this test still
// passes, unchanged, in 2 827 ms. The node-identity test above is the only one
// that catches that regression. What the two assertions at the end add is a
// claim that one makes on its own: a run that finishes while the user is
// off-route still lands on the same live element.
test('a run in flight survives a route change, and finishes into the same element', async () => {
  const screen = await mountApp()
  // The load run first, and not a longer timeout on the click below: Generate
  // is disabled while a run is carving, so `click()` would wait out the load
  // run's own carve inside its actionability wait and report a timeout rather
  // than a broken button.
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
    .toMatchTextContent(/^[\d.]+% · .* pieces · .* left/)

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
  // shows the preview or nothing, so the run's board is deliberately not there
  // (spec §5.3). What this case is about — the run surviving the trip and
  // finishing into the same element — is unchanged.
  await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
  await expect.poll(() => before?.board?.W).toBe(600)
}, 60_000)

// Spec §5.3, PR 4b: the old lab replaces its board only when a run is done
// (lab-page.ts:811-816), and so does this lab. Before the result slice,
// `run.started()` cleared the board and the stage sat empty for a whole carve.
// 600×600 and seed 9 for the reason the case above gives.
test('a run in flight keeps the last result on screen', async () => {
  const screen = await mountApp()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  const element = screen.container.querySelector('arrowz-board')
  const board = element?.board
  expect(board?.W).toBe(25)
  const report = () => screen.getByRole('region', { name: 'Report' }).element().querySelector('table.fw-stats')
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
  // passes on the finished run, so a button disabled while running would pass
  // it (measured in review).
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
  // Polled, not read at once. `BrowserRouter` commits every location change
  // inside `React.startTransition` unless it is given `useTransitions={false}`,
  // which `App` does not, so `hidden` lands after the click has been dispatched
  // rather than during it: a native `click()` followed by a synchronous read
  // sees `false` every time. `userEvent.click`'s round-trip usually outlasts the
  // transition, which is why a synchronous read passed locally and on earlier
  // CI runs, and failed the one time a slow runner returned first.
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'), {
      timeout: 5_000,
    })
    .toBe(true)
}, 20_000)

// Mounted under StrictMode, whose double-invoked mount effect is what the save
// guard's use of a ref rather than state is there to survive, and counting the
// POSTs rather than asserting `saved !== null` — which would be equally true of
// a run posted twice. `fetch` is spied on rather than stubbed, so the POST still
// goes out and still fails for real.
test('a finished run is offered to the store once per run, and the outcome is appended', async () => {
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  // Not through `mountApp`, which renders `App` bare: the defaults have to be
  // put back here too, or this test carves whatever the last one left behind.
  useStore.getState().params.reset()
  useStore.getState().ui.select('board')
  useStore.getState().ui.setAuto(false)
  useStore.getState().ui.setHelp(true)
  useStore.getState().ui.raiseClamped(false)
  useStore.getState().lang.setLang('en')
  useStore.getState().ui.setMode('advanced')
  const screen = await render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  // The page carves on load now, and that run posts too. Its POST is awaited
  // here rather than counted below: it is asynchronous, so raising the two
  // counts to 2 and 3 would make them depend on whether it lands inside the
  // spy's window — the very race the comment in the last test of this file
  // fights. With the save already in, the spy is installed on a quiet page and
  // the counts below are this test's own presses, exactly as before.
  await expect.poll(() => useStore.getState().result.saved !== null, { timeout: 30_000 }).toBe(true)
  const fetchSpy = vi.spyOn(window, 'fetch')
  // The method is part of the predicate: `listBoards()` GETs this same address
  // (api/boards.ts), and PR 5's saved-boards route is what starts calling it —
  // an address-only filter would then count a GET as a save and fail this test
  // for a reason that has nothing to do with what it guards.
  const posts = () =>
    fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards' && call[1]?.method === 'POST')
  try {
    const generate = screen.getByRole('button', { name: 'Generate' })
    const loaded = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)
    // No store server answers in the browser test, so the outcome is a failure —
    // and the run's own outcome must survive beside it. The whole line is
    // asserted, not just the store's half: a status bar that *substituted* the
    // store's answer for the run's would match a looser pattern.
    expect(useStore.getState().run.phase).toBe('done')
    await expect
      .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
      .toMatchTextContent(/^Board closed 100%\. — (not )?saved/)
    expect(posts()).toHaveLength(1)

    // The guard keys on the file object's identity, not on its value. Nothing
    // touches a knob between the two presses, so the second carves a board
    // equal to the first in every field, fingerprint included — a guard that
    // compared values would post once and swallow the second run.
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

test('the lab route shows the console under the stage', async () => {
  const screen = await mountApp()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  await expect.element(screen.getByRole('tabpanel', { name: 'board' })).toBeVisible()
})

// The plumbing itself, which nothing else in this branch touches. `ClampNotice`
// and `RunColumn` are each tested against a host of their own making, so both
// suites stay green with the wiring cut: delete `ref={abortRef}` from
// `RunColumn.tsx:168` or `abortRef={abortRef}` from `Workspace.tsx`'s own
// `<RunColumn …/>` and the
// feature is dead on the real page while every other case passes. The same was
// true of `goRef`, so this case covers both — they are the same two lines.
//
// Both halves are focus reads, and focus is the one thing a component test
// cannot fake: the buttons here are the route's own, reached by role rather
// than by ref, so the assertion can only hold if the ref arrived at the button
// the page renders.
test('the clamp notice hands focus to the route’s own buttons', async () => {
  const screen = await mountApp()
  // The load run first: Generate is disabled while it carves, and the idle
  // half below is about Generate being the live one.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

  // `goRef`. `act`, because `raiseClamped` is a store write from outside a
  // React event and the Dismiss button is not in the DOM until it commits.
  await act(async () => useStore.getState().ui.raiseClamped(true))
  await screen.getByRole('button', { name: 'Dismiss' }).click()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element())

  // `abortRef`: with a carve in flight Generate is refused and Abort is the
  // live one. 600×600 and seed 9 for the reason the in-flight case above
  // gives — the defaults finish in tens of milliseconds, which is less than
  // the click round-trip this case spends before it looks.
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')
  await act(async () => useStore.getState().ui.raiseClamped(true))
  await screen.getByRole('button', { name: 'Dismiss' }).click()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())

  // And the end of the run does not take that focus down with it: `RunColumn`
  // moves it to Generate, which the same commit re-enables. This is the whole
  // mechanism on the real page — the notice parks the focus on Abort, the run
  // ends, and the focus is still on a control. `vi.waitFor` and not a bare
  // read: the redirect is a layout effect of the commit the click flushes, and
  // HTML's own focus fixup would otherwise be racing it.
  await screen.getByRole('button', { name: 'Abort' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('idle')
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element()),
  )
}, 60_000)

test('picking a rail entry replaces the panel', async () => {
  const screen = await mountApp()
  await screen.getByRole('tab', { name: 'skeleton', exact: true }).click()
  await expect.element(screen.getByText('number of skeleton pieces (0 = no skeleton)')).toBeVisible()
  await screen.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect.element(screen.getByRole('switch', { name: /round the corners/i })).toBeVisible()
})

test('Generate is refused while a rule is broken, and the reasons are on screen', async () => {
  const screen = await mountApp()
  // The load run has to be over before the rule is broken, or `toBeDisabled`
  // below would pass on the run rather than on the rule — `RunColumn` disables
  // Generate for either — and the assertion would stop guarding anything.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
  const generate = screen.getByRole('button', { name: 'Generate' })
  await expect.element(generate).toBeDisabled()
  await expect.element(generate).toHaveAttribute('title', 'Fix the settings marked in red to generate')
  await expect.element(screen.getByRole('region', { name: 'Settings outside the safe range' })).toBeVisible()
  useStore.getState().params.reset()
  await expect.element(generate).toBeEnabled()
  // A budget of its own, like every other case here: this one holds a 30 s poll
  // now, and Vitest's 5 s default would kill the test before the poll could
  // report, so a slow carve would name a timeout rather than the assertion.
}, 40_000)

test('a board carved from the console reaches the element and the store', async () => {
  const screen = await mountApp()
  // The load run first: Generate is disabled while it carves, and the click
  // below would spend its actionability wait on it.
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  // The sizes this file already measured: 600×600, because PR 2 timed 200×200
  // at 228 ms and the engine emits no progress before 250 ms (see the comment
  // above the in-flight test). Migrating to the slice must not change them.
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.params?.W).toBe(600)
}, 40_000)

test('the knobs on screen are the knobs the run used', async () => {
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

// The picture a saved board carries is the one the board was drawn with, and
// `DEFAULT_VIEW` sits close enough to the lab's own starting view that only a
// field the user moved tells the two apart — so this test moves one. Read off
// the POST body rather than off `result.saved`, which says only that the store
// answered: the same reason the StrictMode test above counts the client's own
// calls.
test('the saved board carries the view on screen', async () => {
  // `mountApp` resets the run and the params; the view slice is nobody's to
  // reset, so this test puts back what it moved. Its own state, restored by
  // hand rather than by a slice action no page would ever call.
  const was = { colored: useStore.getState().view.colored, stroke: useStore.getState().view.stroke }
  const screen = await mountApp()
  // The load run's own save is awaited before the spy goes on, for the reason
  // the StrictMode case above gives: counted instead, it would be a POST that
  // may or may not be inside the window, and `posts[0]` might be its body
  // rather than this test's. The spy therefore starts after it, and the length
  // assertion below still says which POST this is.
  await expect.poll(() => useStore.getState().result.saved !== null, { timeout: 30_000 }).toBe(true)
  const fetchSpy = vi.spyOn(window, 'fetch')
  try {
    await screen.getByRole('tab', { name: 'Preview', exact: true }).click()
    await screen.getByRole('switch', { name: /colour the arrows/i }).click()
    // A second field, and a number rather than a flag: one boolean surviving
    // the trip says less than "the view the user was looking at survived it".
    useStore.getState().view.setNumber('stroke', '0.8')
    const loaded = useStore.getState().result.shown?.file
    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)

    // Filtered, not `find`: the tests above poll only to `run.phase === 'done'`
    // and never await their own save, so a POST of theirs can still land inside
    // this spy's window — and `find` would then read that body instead of this
    // one. The length assertion is what says which POST this is.
    const posts = fetchSpy.mock.calls.filter((call) => String(call[0]) === '/api/boards' && call[1]?.method === 'POST')
    expect(posts).toHaveLength(1)
    const request = JSON.parse(String(posts[0]?.[1]?.body)) as StoreRequest
    expect(request.view.colored).toBe(true)
    expect(request.view.stroke).toBe(0.8)
    // The zeroing that used to be a no-op, now that the view is the lab's: the
    // highlight is on and set to 5 pieces, and a stored board keeps none of it.
    expect(useStore.getState().view.top).toBe(5)
    expect(request.view.top).toBe(0)
    // The cell a viewer opens the file at is the run's own, as `carve` computes
    // it (command.ts:513) — not the slice's starting 12, which nothing moves.
    expect(request.view.cell).toBe(exportCell(25, 50))
    expect(request.view.cell).not.toBe(12)
  } finally {
    fetchSpy.mockRestore()
    if (useStore.getState().view.colored !== was.colored) useStore.getState().view.toggle('colored')
    useStore.getState().view.setNumber('stroke', String(was.stroke))
  }
}, 40_000)

// Ruling 7, on the real page. The column is looked up once, before the swap,
// and compared by identity after it: a remount would leave an equal-looking
// region that is a different node. What a remount costs is real — the focus a
// keyboard user left on Generate, and the column's `wasRunning` ref.
//
// Mutation that must turn this red: in `Console.tsx`, return
// `<div className="fw-console"><SimplePanel control={control} />{children}</div>`
// for the simple mode, so `children` moves from the third position to the second.
test('the simple view replaces the rail and the presets, and keeps the very same run column', async () => {
  const screen = await mountApp()
  const column = screen.getByRole('region', { name: 'Run' }).element()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  expect(screen.getByRole('tablist', { name: 'Parameter groups' }).query()).toBeNull()
  expect(screen.getByRole('group', { name: 'Presets' }).query()).toBeNull()
  expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
  await screen.getByRole('radio', { name: 'Advanced' }).click()
  await expect.element(screen.getByRole('tablist', { name: 'Parameter groups' })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
}, 40_000)

// Ruling 9: `auto` and `help` belong to the knobs, and the knobs are not on screen.
test('the simple view hides the two switches only the advanced view has', async () => {
  const screen = await mountApp()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  expect(screen.getByRole('switch', { name: 'generate right after a change' }).query()).toBeNull()
  expect(screen.getByRole('switch', { name: 'show parameter descriptions' }).query()).toBeNull()
  await expect.element(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument()
}, 40_000)

// Ruling 10: without its first row the lab grid would auto-place the stage
// into the `auto` track. Measured on the element the grid actually sizes.
test('the stage keeps its height when the preset strip goes', async () => {
  const screen = await mountApp()
  const stage = () => screen.container.querySelector<HTMLElement>('.fw-stage')?.getBoundingClientRect().height ?? 0
  await expect.poll(stage).toBeGreaterThanOrEqual(180)
  const before = stage()
  await screen.getByRole('radio', { name: 'Simple' }).click()
  await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  // Not a 180px floor: at the runner's 414×896 an auto-placed stage still
  // measures 292px (measured in review: the board's 260px min-height plus its
  // padding, which the max-height: 700px rule releases), so the floor could
  // not fail. The strip's row goes to the two remaining rows, so the stage can
  // only grow.
  await expect.poll(stage).toBeGreaterThanOrEqual(before)
}, 40_000)

// Spec §5.1, PR 5a: one panel serves both tabs and renames itself with the
// route, because the tab strip resolves `aria-controls` to that id. Two
// parallel panels could not both hold the one stage.
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

// Ruling 6: the preset strip goes, the stage stays — the same node, not merely
// a node in the same place. Measured by review round 1: a React `null` slot
// renders no DOM node, so the stage's *index* among `.fw-lab.children`
// legitimately drops from 1 to 0 while its identity holds. The index was the
// wrong instrument; identity is the claim.
test('the preset strip is absent from the library and the stage is the same node', async () => {
  const screen = await mountApp()
  const stage = () => screen.container.querySelector('.fw-stage')
  const before = stage()
  expect(before).not.toBeNull()
  // Established before the click, so the assertion after it means something:
  // without this, the case's meaning would rest entirely on `mountApp`'s
  // `setMode('advanced')`, and a default-mode change would hollow it out
  // silently.
  expect(screen.container.querySelector('.fw-presets')).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  expect(screen.container.querySelector('.fw-presets')).toBeNull()
  expect(stage()).toBe(before)
})

// The docs are not the workspace: there the panel is hidden, as it was before
// this PR for every route but `/`.
test('the workspace is hidden under the docs route', async () => {
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Docs', exact: true }))
  await expect
    .poll(() => screen.container.querySelector('main[hidden] [role="tabpanel"]')?.id, { timeout: 5_000 })
    .toBe('lab-panel')
}, 40_000)

// Ruling 1: the run column is hidden in the library, not replaced. A carve
// started in the lab keeps its node, its refs and the run itself; the old lab
// hides the same controls by class. Read through `querySelector`, not a role
// locator, precisely because a locator skips `display: none` — the state
// under test.
//
// The viewport is set first and deliberately: at the runner's default
// 414×896 the ≤900px query already gives `.fw-console` two tracks, so the
// track assertion below would pass with the library rule deleted. Review
// round 1 measured exactly that.
test('the run column stays mounted, and hidden, in the library', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp()
  const column = () => screen.container.querySelector('.fw-run-col')
  const before = column()
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')

  const after = column()
  expect(after).toBe(before)
  if (!(after instanceof HTMLElement)) throw new Error('the run column is not an HTML element')
  expect(getComputedStyle(after).display).toBe('none')
  // And the console gives its width to the two tracks that are left: a hidden
  // grid item takes no track.
  const consoleBox = screen.container.querySelector('.fw-console')
  if (!(consoleBox instanceof HTMLElement)) throw new Error('the console is not on the page')
  expect(getComputedStyle(consoleBox).gridTemplateColumns.split(' ')).toHaveLength(2)
})

// The library has no preset strip, and the lab grid's first row is `auto`:
// without `.fw-lab.library` the stage takes 590px and the console is left with
// its 180px minimum on every viewport (measured, review round 1). This is the
// same trap `.fw-lab.simple` exists to avoid, so it is asserted the same way:
// by the two rows being the halves they are in the lab, not by a class name.
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

// Solo is the stage's, not the lab tab's: the old lab's full view works on
// both tabs (`lab-page.ts:1027-1029`). The `f` key is the application's, so
// this presses it rather than clicking the toggle.
//
// The viewport is stated rather than inherited. `page.viewport` outlives the
// case that sets it, and the case above leaves 1400×900 behind, so without
// this line the width here would be whatever the file happens to end on — a
// dependency on test order in a case that has no business having one. 1400×900
// and not the runner's default because that is what the cases around it use,
// and because at that width the console is genuinely on screen for solo to
// take away; the assertions themselves hold at either width.
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

// The defect review round 1 found, and the reason `useStoredBoard` is mounted
// in `Workspace`: with the hook inside the library panel, `Console` unmounted
// it on the way out, nothing ever cleared the preview, and the lab tab went on
// drawing, announcing and reporting a board read off the disk.
//
// The board MUST be opened through the address, not by calling `showPreview`.
// Review round 2 measured the shortcut version staying red in both worlds: the
// clearing effect keys on the address, and a preview put there by hand is a
// state the hook never produced, so the case discriminated nothing. Written
// this way it is green with the hook in `Workspace` and red with it back in
// `BoardList` — which is what a regression test for this defect has to do.
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
    // 1400×900 on purpose: at the runner's 414×896 the stage overlaps the row
    // this case has to click, and Playwright refuses the click as intercepted
    // by `<arrowz-board>`. Review round 3 measured it — the case would then be
    // failing about a layout overlap while claiming to be about the hook.
    await page.viewport(1400, 900)
    const screen = await mountApp()
    await loadRunDone()
    const runAnnotation = screen.container.querySelector('.fw-anno')?.textContent

    await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
    await expect.element(screen.getByText(meta.id)).toBeVisible()
    await userEvent.click(screen.getByText(meta.id))
    await expect.poll(() => screen.container.querySelector('.fw-anno')?.textContent).toBe('8×8 · seed 4')
    expect(screen.container.querySelectorAll('.fw-report table')).toHaveLength(0)

    await userEvent.click(screen.getByRole('tab', { name: 'Lab', exact: true }))
    await expect.poll(() => useStore.getState().result.preview).toBeNull()
    expect(screen.container.querySelector('.fw-anno')?.textContent).toBe(runAnnotation)
    await expect.poll(() => screen.container.querySelectorAll('.fw-report table').length).toBeGreaterThan(0)
  } finally {
    vi.restoreAllMocks()
  }
}, 40_000)

// `.fw-lab.library.solo` is load-bearing and nothing above measures it: the
// solo case reads `ui.solo` and a class name, both of which survive the rule's
// deletion. Geometry does not — review round 2 deleted the selector and this
// went red at 1400 and at 860, because `.fw-lab.library` would otherwise beat
// `.fw-lab.solo` on order.
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
  expect(element.height).toBeCloseTo(lab.height - 34, 0)
}, 40_000)

// Fix 8's own case: the library face must not keep its 168px rail below 900px,
// where the lab's is 150px. This is what tells the executor that the two
// `.fw-console.library` rules went in *above* the media query (Task 6 Step 4).
test('below 900px the library rail is the lab rail', async () => {
  await page.viewport(860, 900)
  const screen = await mountApp()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  await expect.poll(() => screen.container.querySelector('[role="tabpanel"]')?.id).toBe('boards-panel')
  const consoleBox = screen.container.querySelector('.fw-console')
  if (!(consoleBox instanceof HTMLElement)) throw new Error('the console is not on the page')
  expect(getComputedStyle(consoleBox).gridTemplateColumns.split(' ')[0]).toBe('150px')
}, 40_000)
