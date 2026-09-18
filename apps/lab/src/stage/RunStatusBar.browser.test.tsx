import { decodeBoard, defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { genSeconds } from '@arrowz/engine/report'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { beforeEach, describe, expect, it } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import type { DoneReport } from '../state/run.slice'
import { useStore } from '../state/store'
import { RunStatusBar } from './RunStatusBar'

/**
 * The bar asks the route now (`useInLibrary`), so it needs a router. `/` is the
 * lab, which is what every case written before the saved boards existed means.
 */
async function mountBar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RunStatusBar />
    </MemoryRouter>,
  )
}

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
  // `boardError` is the chain's first branch now, outranking even the refusal
  // the first case is named for, so a case that sets it would otherwise decide
  // every case after it in this file.
  state.library.reset()
})

describe('RunStatusBar', () => {
  // Ruling 13: `auto` and a pasted link have no disabled button to look at,
  // and on /boards there is no Violations panel either.
  it('says the run is refused while a rule is broken', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await mountBar()
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generateBlocked'))
  })

  it('goes back to the prompt when the rule is satisfied again', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await mountBar()
    useStore.getState().params.setMany({ wShort: 0.3, wMid: 0.3 })
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })

  // A carve that will take a while is warned about before it starts; spec §10
  // lists it among the features the port must restore.
  it('warns for a board over 200 000 cells, and not for a small one', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await mountBar()
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  it("keeps naming the run's own size after a knob moves during the carve", async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 600, H: 600 })
    state.run.started(useStore.getState().params.values)
    const screen = await mountBar()
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
    const screen = await mountBar()
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
    const screen = await mountBar()
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
    const screen = await mountBar()
    await act(async () => useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('generating'))
  })

  it('says only "Generating…" for a board under the threshold', async () => {
    const state = useStore.getState()
    state.params.setMany({ W: 25, H: 25 })
    state.run.started(useStore.getState().params.values)
    const screen = await mountBar()
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
    const screen = await mountBar()
    await expect.element(screen.getByRole('status')).toMatchTextContent(`${EN.t('closed')} — ${EN.t('notSaved')}`)
    const next = { ...CLOSED, board: { ...CLOSED.board } }
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().completeRun({ board: RESULT.board, file: next.board, report: next })
    })
    await expect.poll(() => screen.getByRole('status').element().textContent).toBe(EN.t('closed'))
  })

  // Ruling 8, guarded here for the first time. The line speaks for the board
  // the library has on screen, and the store's answer is not appended to it:
  // `saved` is a fact about the run's result, and a stored board is not a run.
  // The run below is finished *and* answered for, so an appended answer would
  // show — the whole text is compared, because `toMatchTextContent` is
  // satisfied by a substring and would pass on the very line this forbids.
  it('speaks for the stored board on the library tab, without the run answer', async () => {
    const { meta, file } = storedFixture(2)
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    state.result.stored(CLOSED.board, { ok: false, error: 'no store server' })
    state.result.showPreview({ board: decodeBoard(file), file, meta })
    const screen = await mountBar(`/boards/8x8/${meta.id}`)
    const line = EN.t('savedBoard', `8x8/${meta.id}`, meta.seed, meta.source, `${genSeconds(meta, '—')} s`)
    await expect.poll(() => screen.getByRole('status').element().textContent).toBe(line)
  })

  // Ruling P: the whole reason reaches the dictionary, not merely the branch.
  // `boardError` carries the address and the failure as two fields, so a reason
  // with a `: ` of its own arrives intact — which is the property this case has
  // always been for. It was written when the two travelled joined by `: ` and
  // the bar split them back apart, where the second colon could truncate the
  // reason; the typed field makes it true by construction, and this still says so.
  it('reports a board that could not be read, keeping a colon inside the reason', async () => {
    useStore.getState().library.boardFailed({ name: '8x8/sha256-ab', reason: 'HTTP 500: gateway down' })
    const screen = await mountBar('/boards/8x8/sha256-ab')
    await expect
      .poll(() => screen.getByRole('status').element().textContent)
      .toBe(EN.t('boardFileError', '8x8/sha256-ab', 'HTTP 500: gateway down'))
  })

  // Ruling O: both library branches ask the tab, not the preview alone.
  // `useInLibrary` flips with the location render while `useStoredBoard` clears
  // these two in an effect after commit, so on the way back to `/` the lab
  // would otherwise announce a stored board — over a carve of its own — for one
  // committed frame. Both branches are set here, so this case fails if either
  // loses its gate.
  it('says nothing about a stored board once the tab is the lab again', async () => {
    const { meta, file } = storedFixture(2)
    const state = useStore.getState()
    state.result.showPreview({ board: decodeBoard(file), file, meta })
    state.library.boardFailed({ name: '8x8/sha256-ab', reason: 'HTTP 404' })
    const screen = await mountBar()
    // Read once and synchronously: the state is set before the mount, so the
    // first render already answers, and a poll would only wait out a wrong one.
    expect(screen.getByRole('status').element().textContent).toBe(EN.t('pressGenerate'))
  })

  // Ruling 5: the newest thing the library did outranks the description of the
  // board on screen, and gives way again when its own timer takes it back.
  it('says what the library has just done, ahead of the board it is showing', async () => {
    const { meta, file } = storedFixture(1)
    const screen = await mountBar(`/boards/8x8/${meta.id}`)
    await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)

    await act(async () => useStore.getState().library.notify({ kind: 'viewSaved', name: `8x8/${meta.id}` }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved the new view/)

    await act(async () => useStore.getState().library.clearNotice())
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)
  })

  // Pins the branch order itself: the notice check has to run ahead of
  // `boardError`'s, not merely produce the same text as every other case here
  // happens to. Both are set on the same board so the two branches disagree
  // about what the line should say, and only the notice going first is right.
  it('lets a notice speak over the board error at the same address', async () => {
    const screen = await mountBar('/boards/8x8/sha256-ab')
    await act(async () => {
      useStore.getState().library.boardFailed({ name: '8x8/sha256-ab', reason: 'HTTP 404' })
      useStore.getState().library.notify({ kind: 'deleted', name: '8x8/x' })
    })
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Deleted/)
  })

  it('names the library’s four remaining messages', async () => {
    const screen = await mountBar('/boards')
    for (const [notice, words] of [
      [{ kind: 'loading', name: '8x8/x' }, /Loading 8x8\/x/],
      [{ kind: 'deleted', name: '8x8/x' }, /Deleted 8x8\/x/],
      // Not `new RegExp(EN.ui.notSaved)`: that string is `not saved (no store
      // server)`, whose brackets a regular expression reads as a group, so it
      // would match a sentence the dictionary does not contain.
      [{ kind: 'saveFailed' }, /not saved/],
      [{ kind: 'deleteFailed' }, /Could not delete/],
    ] as const) {
      await act(async () => useStore.getState().library.notify(notice))
      await expect.element(screen.getByRole('status')).toMatchTextContent(words)
    }
  })

  // The library's messages belong to the library. A notice left behind must not
  // speak over a carve on the lab tab.
  it('says nothing of the library while the lab is the tab', async () => {
    const screen = await mountBar('/')
    await act(async () => useStore.getState().library.notify({ kind: 'deleted', name: '8x8/x' }))
    // From the dictionary, not a regex: the string is `Press "Generate".`, and
    // review round 1 measured `/Press Generate/` failing on the quotation marks.
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })
})
