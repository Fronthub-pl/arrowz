import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { act } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DoneReport } from '../state/run.slice'
import { useStore } from '../state/store'
import { RunStatusBar } from './RunStatusBar'

const EN = dictionary('en')

// A real finished run, because the refusal case below has to sit on top of the
// branch that prints a closed board. `ok` and `deadlock` are stated rather than
// taken from the result: the case is about which branch wins, not about how
// this 8x8 came out, and a board that happened to come out unsolvable would
// send it down a different branch and stop it testing what it is named for.
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

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
})

describe('RunStatusBar', () => {
  // Ruling 13: `auto` and a pasted link have no disabled button to look at,
  // and on /boards there is no Violations panel either.
  it('says the run is refused while a rule is broken', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generateBlocked'))
  })

  it('goes back to the prompt when the rule is satisfied again', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunStatusBar />)
    useStore.getState().params.setMany({ wShort: 0.3, wMid: 0.3 })
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })

  // The old lab warns before a carve that will take a while (lab-page.ts:882);
  // spec §10 lists it among the features the port must restore.
  it('warns for a board over 200 000 cells, and not for a small one', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  it("keeps naming the run's own size after a knob moves during the carve", async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    // The console's own knobs move to a small size while the run is still in
    // flight. A component that (wrongly) read the live knobs instead of
    // `run.params` would now print the plain `generating` text; this must
    // still name the run's own 600×600.
    //
    // `act`, because a store write from outside a React event reaches the DOM
    // on a microtask at the earliest: without it the discriminating render and
    // `expect.element`'s first await are racing, and the case can only pass.
    await act(async () => useStore.getState().params.setMany({ W: 25, H: 25 }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  // Ruling T. The refusal used to print only while the slice was idle, which
  // was the whole story until the page began carving a board at load: `done`
  // is now the state of every session from its first second and it stays
  // there. With `auto` on, a knob dragged into a violation refused silently
  // while this line kept reporting the board the last run closed.
  it('says the refusal over a finished run, not the board that run closed', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    const screen = await render(<RunStatusBar />)
    // The precondition, so the case cannot pass by the refusal being printed
    // everywhere: with no violation this is the closed board.
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('closed'))
    await act(async () => useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generateBlocked'))
  })

  // The same sequence with the store's answer in it, which is the half nothing
  // asserted. `result.stored()` is the only thing that sets `saved`, and only
  // the result slice's `show` and `reset` clear it, so a knob dragged into a
  // violation after a saved run leaves the outcome behind — and the bar used to
  // glue it to the refusal:
  // `Fix the settings marked in red to generate — not saved (no store server)`.
  //
  // The whole text is compared, not matched inside: `toMatchTextContent` is
  // satisfied by a substring, so it would pass on exactly the line this case
  // exists to forbid.
  it('keeps the save outcome off a line that is refusing rather than reporting', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    state.result.stored(CLOSED.board, { ok: false, error: 'no store server' })
    const screen = await render(<RunStatusBar />)
    // The precondition: beside a line that is reporting a run, the outcome is
    // still appended — §5.3's rule is not being deleted, only scoped.
    await expect.element(screen.getByRole('status')).toMatchTextContent(`${EN.t('closed')} — ${EN.t('notSaved')}`)
    await act(async () => useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 }))
    expect(screen.getByRole('status').element().textContent).toBe(EN.t('generateBlocked'))
  })

  // The exception the rule keeps: a carve in flight has more to say than the
  // refusal and is entitled to report itself, even though the knobs it would
  // be started from now break a rule.
  it('still reports a run in flight while the knobs on screen are refused', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    const screen = await render(<RunStatusBar />)
    await act(async () => useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generating'))
  })

  it('says only "Generating…" for a board under the threshold', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 25, H: 25 })
    state.run.started(useStore.getState().params.values)
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generating'))
  })

  // PR 4b: a run in flight keeps the last result and its answer, so the next
  // board must start without the answer of the one before — `show` clears it.
  // Without that, the next closed board reads "— not saved" before its own
  // POST has even gone out.
  it('does not carry the answer for one board onto the next', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    state.result.stored(CLOSED.board, { ok: false, error: 'no store server' })
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(`${EN.t('closed')} — ${EN.t('notSaved')}`)
    const next = { ...CLOSED, board: { ...CLOSED.board } }
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().completeRun({ board: RESULT.board, file: next.board, report: next })
    })
    await expect.poll(() => screen.getByRole('status').element().textContent).toBe(EN.t('closed'))
  })
})
