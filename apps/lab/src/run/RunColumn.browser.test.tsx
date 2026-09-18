import { act, useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { defaultParams, encodeBoard, generate, PARAM_SPEC } from '@arrowz/engine'
import type { DoneReport } from '../state/run.slice'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { RunColumn } from './RunColumn'
// The last case measures where the command box clips, which needs the real
// cascade: the tokens, `.fw`'s font, and the column's own rules, in the order
// `main.tsx` loads them.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

function stub() {
  const calls = { start: 0, abort: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => void calls.abort++, hold: () => {} }
  return { control, started: () => calls.start, aborted: () => calls.abort }
}

// A real finished run, so the focus case below can end a carve the way a carve
// ends — `completeRun()`, and not the `aborted()` that would also flip `running`
// but is the user's own doing. 8×8 because nothing here reads the report; `ok`
// and `deadlock` are stated rather than taken from the result for the same
// reason `RunStatusBar.browser.test.tsx` states them.
const RESULT = generate({ ...defaultParams(), W: 8, H: 8, seed: 1 })
const CLOSED: DoneReport = {
  type: 'done',
  ok: true,
  metrics: RESULT.metrics,
  backtracks: RESULT.backtracks,
  restartsUsed: RESULT.restartsUsed,
  genMs: RESULT.genMs,
  metricsMs: RESULT.metricsMs,
  totalMs: RESULT.genMs + RESULT.metricsMs,
  stuck: null,
  deadlock: false,
  pieces: RESULT.board.pieces.length,
  stats: RESULT.board.stats,
  board: encodeBoard(RESULT.board),
}

/** The one control the button is: `locator.element()` returns an `Element`. */
function buttonOf(element: Element): HTMLButtonElement {
  if (!(element instanceof HTMLButtonElement)) throw new Error('that control is not a button')
  return element
}

/**
 * Two frames, because HTML's focus fixup is the "update the rendering" step,
 * which runs after the animation-frame callbacks of the same frame. Two is the
 * floor, not a margin — see the measured distribution at the focus cases below
 * before shortening this.
 */
function twoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/**
 * The route's two refs, which is the only shape in which the focus effect has
 * anything to aim at. Declared once here rather than four times inside the
 * cases, so that every focus case mounts the same column the page mounts.
 */
function Host({ control }: { control: RunControl }) {
  const go = useRef<HTMLButtonElement>(null)
  const abort = useRef<HTMLButtonElement>(null)
  return <RunColumn control={control} goRef={go} abortRef={abort} />
}

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.ui.setAuto(false)
  state.ui.setHelp(true)
  state.ui.setMode('advanced')
})

describe('RunColumn', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Run' })).toBeInTheDocument()
  })

  it('starts a run from the primary action', async () => {
    const g = stub()
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Generate' }).click()
    expect(g.started()).toBe(1)
  })

  it('refuses the primary action while a rule is broken, and says why', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={stub().control} />)
    const go = screen.getByRole('button', { name: 'Generate' })
    await expect.element(go).toBeDisabled()
    await expect.element(go).toHaveAttribute('title')
  })

  // Abort is not a second Generate: it is live exactly while a worker is.
  it('offers Abort only while a run is in flight', async () => {
    const g = stub()
    const screen = await render(<RunColumn control={g.control} />)
    await expect.element(screen.getByRole('button', { name: 'Abort' })).toBeDisabled()
    useStore.getState().run.started(useStore.getState().params.values)
    await expect.element(screen.getByRole('button', { name: 'Abort' })).toBeEnabled()
    await screen.getByRole('button', { name: 'Abort' }).click()
    expect(g.aborted()).toBe(1)
  })

  // The clamp notice parks the focus on Abort when Generate is refused, which
  // is exactly while a carve is in flight — so that focus has an expiry date.
  // The commit that ends the carve renders Abort `disabled`, and HTML's focus
  // fixup then takes the focus off it: the very drop the notice exists to
  // prevent, deferred by the length of the carve.
  //
  // The timing is the whole case, and it was measured rather than assumed:
  // batches of 20 samples in Chrome 153.0.8010.12 with the effect's `focus()`
  // cut out put `document.activeElement` at `document.body` in 0/20
  // synchronously after the `act` below, 0/20 on a microtask, 0–2/20 on
  // `setTimeout 0`, 0–2/20 after one `requestAnimationFrame`, and 20/20 after
  // two. The fixup is not a macrotask: it is the "update the rendering" step,
  // which runs after the animation-frame callbacks of the same frame, so one
  // rAF still sees the button, and the stray early samples are runs in which a
  // frame's rendering step fell between the commit and the sampling call.
  //
  // So `twoFrames()` is exactly the minimum, not a margin over one. Of the two
  // assertions, `toBe(Generate)` catches a deleted branch at any sampling
  // point, because before the fixup the focus is still on Abort. It is
  // `not.toBe(document.body)` — the line that says what a person would notice
  // — that holds on broken code at every point short of two frames, in 18–20
  // samples of 20. Shortening the wait turns that line into decoration.
  it('carries the focus off Abort when the run that made it live ends', async () => {
    const g = stub()
    const screen = await render(<Host control={g.control} />)
    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    const abort = buttonOf(screen.getByRole('button', { name: 'Abort' }).element())
    abort.focus()
    // The precondition, so a case that never got the focus onto Abort cannot
    // pass by the focus having been on Generate all along.
    expect(document.activeElement).toBe(abort)

    await act(async () => useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED }))
    await twoFrames()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element())
  })

  // The mirror of the case above, and the reason it is not an edge case:
  // Generate is `disabled={running || blocked}`, so starting a run is what
  // disables Generate. The fixup follows the same schedule, measured here too
  // in two batches of 20 with the branch cut out: the focus is still on
  // Generate in 19–20 samples of 20 at every point short of two frames, and on
  // `document.body` in 20/20 after two. Hence `twoFrames()` again, for the same
  // reason and as the same floor.
  it('carries the focus off Generate when starting a run is what disables it', async () => {
    const g = stub()
    const screen = await render(<Host control={g.control} />)
    const go = buttonOf(screen.getByRole('button', { name: 'Generate' }).element())
    go.focus()
    // The precondition, so a case that never got the focus onto Generate
    // cannot pass by the focus having been on Abort all along.
    expect(document.activeElement).toBe(go)

    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    await twoFrames()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())
  })

  // The same transition reached the way a person reaches it, rather than
  // through the store: a real Enter on a focused Generate. `control.start`
  // writes `run.started` synchronously — `useGenerator.start` is
  // `actions().started(params)` before anything asynchronous — so the commit
  // that disables Generate is the one React flushes for this key press, which
  // is exactly why the press loses its own focus without the branch.
  it('keeps the focus on a control when Generate is pressed from the keyboard', async () => {
    const live: RunControl = {
      start: () => useStore.getState().run.started(useStore.getState().params.values),
      abort: () => useStore.getState().run.aborted(),
      hold: () => {},
    }
    const screen = await render(<Host control={live} />)
    const go = buttonOf(screen.getByRole('button', { name: 'Generate' }).element())
    go.focus()
    expect(document.activeElement).toBe(go)

    await userEvent.keyboard('{Enter}')
    expect(useStore.getState().run.phase).toBe('running')
    await twoFrames()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())
  })

  // The other half of the same guard, now in both directions: `running` is
  // false on every idle render and true on every running one, so a fix that
  // read the state rather than the transition would pull the focus out of
  // whatever the user was using, on every commit. Defaults is the probe
  // because it is live throughout — it carries no `disabled` at all.
  it('leaves a focus that is on neither button where the user put it', async () => {
    const g = stub()
    const screen = await render(<Host control={g.control} />)
    const defaults = buttonOf(screen.getByRole('button', { name: 'Defaults' }).element())
    defaults.focus()
    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    // Asserted here as well as at the end, so the start branch is named:
    // without this line a start branch that grabbed the focus would be caught
    // only indirectly, by the end branch then moving it on to Generate.
    await twoFrames()
    expect(document.activeElement).toBe(defaults)
    await act(async () => useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED }))
    await twoFrames()
    expect(document.activeElement).toBe(defaults)
  })

  // The hook behind `auto` is tested on its own; what is only visible here is
  // that the column's two switches are the store's two fields and not local
  // state of their own.
  it('flips the store from either switch', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await screen.getByRole('switch', { name: 'generate right after a change' }).click()
    expect(useStore.getState().ui.auto).toBe(true)
    await screen.getByRole('switch', { name: 'show parameter descriptions' }).click()
    expect(useStore.getState().ui.help).toBe(false)
  })
})

describe('the alternative actions', () => {
  it('draws a new seed and runs at once', async () => {
    const g = stub()
    useStore.getState().params.setMany({ seed: 1 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(useStore.getState().params.values.seed).not.toBe(1)
    expect(g.started()).toBe(1)
  })

  // Ruling 3: the seed came from the machine, not from a hand, so it must not
  // look like an edit — otherwise `auto` starts a second run behind it.
  it('draws that seed through the machine path, leaving the edit count alone', async () => {
    const before = useStore.getState().params.edits
    const screen = await render(<RunColumn control={stub().control} />)
    await screen.getByRole('button', { name: 'New seed' }).click()
    expect(useStore.getState().params.edits).toBe(before)
  })

  it('puts every knob back and runs at once', async () => {
    const g = stub()
    useStore.getState().params.set('W', 77)
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.values.W).toBe(defaultParams().W)
    expect(g.started()).toBe(1)
  })

  // This does not exercise clamping: the draw now spans exactly the knob's
  // range — `getRandomValues` fills the same 32 bits PARAM_SPEC allows — so
  // nothing here would fail if the clamp were removed. It guards the draw in
  // `reseed` from drifting past the spec; clamping itself is covered where
  // clamping lives (params.slice.test.ts, "a committed value is clamped to
  // the knob range and reported").
  it('never draws a seed outside the knob', async () => {
    const spec = PARAM_SPEC.find((s) => s.key === 'seed')
    if (spec === undefined) throw new Error('PARAM_SPEC has no seed')
    const screen = await render(<RunColumn control={stub().control} />)
    for (let i = 0; i < 20; i++) await screen.getByRole('button', { name: 'New seed' }).click()
    const seed = useStore.getState().params.values.seed
    expect(seed).toBeGreaterThanOrEqual(spec.min)
    expect(seed).toBeLessThanOrEqual(spec.max)
  })

  // Neither button is disabled by a broken rule, and neither should be: the
  // point of Defaults is to escape one. New seed cannot, and says so through
  // the status line rather than through a dead button (Ruling 13).
  it('leaves Defaults usable while a rule is broken, and it clears the rule', async () => {
    const g = stub()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.violations).toHaveLength(0)
    expect(g.started()).toBe(1)
  })

  // Geometry and computed style, because no text lookup can fail for this:
  // `.fw-cmd`'s text is in the DOM whether or not the box paints it, so the
  // suite stayed green while a browser pass measured the column showing about
  // a third of the command. Rendered inside a `.fw` root at the console's own
  // third-track width, with the real cascade, and short enough that the box is
  // already at its 58px floor — which is the only state in which it clips, and
  // so the only state in which this rule does anything.
  it('leaves the whole command reachable, without moving Generate', async () => {
    const screen = await render(
      <div className="fw" style={{ display: 'flex', width: '216px', height: '300px' }}>
        <RunColumn control={stub().control} />
      </div>,
    )
    const generateTop = () => screen.getByRole('button', { name: 'Generate' }).element().getBoundingClientRect().top
    const before = generateTop()
    await act(async () =>
      useStore.getState().params.setMany({
        W: 137,
        H: 251,
        seed: 987654,
        pStraight: 0.83,
        wShort: 0.45,
        wMid: 0.35,
        trapBias: 3,
        backbite: 6,
        giants: 4,
      }),
    )
    const pre = screen.container.querySelector('.fw-cmd')
    if (pre === null) throw new Error('the command box is not on the page')
    // A command that already fits has nothing out of sight, and this case
    // would pass without asserting anything.
    expect(pre.scrollHeight).toBeGreaterThan(pre.clientHeight)
    // `overflow-y` and not `scrollTop`: an `overflow: hidden` box is still
    // programmatically scrollable, so setting `scrollTop` would succeed under
    // the very rule this case exists to forbid. The computed value is what
    // decides whether a person can reach the rest.
    expect(getComputedStyle(pre).overflowY).not.toBe('hidden')
    // The reason the fix is inside the box rather than `flex: none` on the
    // figure: `LiveCommand` is the column's first child, so a figure that grew
    // with the command would walk the primary action down the column.
    expect(generateTop()).toBe(before)
  })
})

// Spec §5.2: the exports belong to the board, not to the knobs, so the simple
// view keeps them — unlike `auto` and `help` (PR 4a, Ruling 9).
describe('the exports', () => {
  it.each(['advanced', 'simple'] as const)('are in the column in the %s view', async (mode) => {
    useStore.getState().ui.setMode(mode)
    const screen = await render(<RunColumn control={stub().control} />)
    await expect.element(screen.getByRole('group', { name: 'Export' })).toBeInTheDocument()
  })
})
