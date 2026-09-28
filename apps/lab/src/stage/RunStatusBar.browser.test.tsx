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
import { useRunState } from './useRunState'

/** The bar asks the route (`useInLibrary`), so it needs a router; `/` is the lab. */
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
// taken from the result, so the case cannot slip into another branch.
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
  // `boardError` outranks even the refusal, so a case that sets it would
  // otherwise decide every case after it in this file.
  state.library.reset()
  useStore.setState((s) => ({ lang: { ...s.lang, lang: 'en' } }))
})

describe('RunStatusBar', () => {
  // `auto` and a pasted link have no disabled button to look at, and on /boards
  // there is no Violations panel either.
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

  // A carve that will take a while is warned about before it starts.
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
    // The knobs move to a small size while the run is in flight; a component
    // reading the live knobs instead of `run.params` would print the plain
    // `generating` text. `act`, because a store write from outside a React event
    // reaches the DOM on a microtask at the earliest.
    await act(async () => useStore.getState().params.setMany({ W: 25, H: 25 }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/600×600/)
  })

  // The slice is `done` from the page's first carve on, so with `auto` on a knob
  // dragged into a violation must still print the refusal, not the last board.
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

  // With the store's answer in it: `saved` survives a knob dragged into a
  // violation, and must not be glued to the refusal. The whole text is compared:
  // `toMatchTextContent` matches a substring and would pass on the forbidden line.
  it('keeps the save outcome off a line that is refusing rather than reporting', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    state.result.stored(CLOSED.board, { ok: false, error: 'no store server' })
    const screen = await mountBar()
    // The precondition: beside a line that reports a run, the outcome is still appended.
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

  // A run in flight keeps the last result and its answer, so `show` must clear
  // the answer: otherwise the next closed board reads "— not saved" before its
  // own POST has gone out.
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

  // The line speaks for the board the library has on screen, and the store's
  // answer is not appended: `saved` is about the run's result, and a stored
  // board is not a run. The run below is answered for, so an appended answer
  // would show; the whole text is compared, not a substring.
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

  // `boardError` carries the address and the failure as two fields, so a reason
  // with a `: ` of its own reaches the dictionary whole.
  it('reports a board that could not be read, keeping a colon inside the reason', async () => {
    useStore.getState().library.boardFailed({ name: '8x8/sha256-ab', reason: 'HTTP 500: gateway down' })
    const screen = await mountBar('/boards/8x8/sha256-ab')
    await expect
      .poll(() => screen.getByRole('status').element().textContent)
      .toBe(EN.t('boardFileError', '8x8/sha256-ab', 'HTTP 500: gateway down'))
  })

  // The lab words this one itself, so it follows the page's language.
  it('says a board is not in the store in the page’s language, and rewords it on a switch', async () => {
    useStore.getState().library.boardFailed({ name: '8x8/sha256-ab', reason: null })
    const screen = await mountBar('/boards/8x8/sha256-ab')
    const text = () => screen.getByRole('status').element().textContent
    await expect.poll(text).toBe(EN.t('boardNotStored', '8x8/sha256-ab'))
    useStore.getState().lang.setLang('pl')
    await expect.poll(text).toBe(dictionary('pl').t('boardNotStored', '8x8/sha256-ab'))
  })

  // Both library branches ask the tab, not the slice alone: on the way back to
  // `/` they are cleared an effect after the route changes. Both are set here,
  // so this case fails if either loses its gate.
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

  // The newest thing the library did outranks the description of the board on
  // screen, and gives way again when its own timer takes it back.
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

  // Pins the branch order: both are set so the two branches disagree, and only
  // the notice going first is right.
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
    // `/Press Generate/` fails on the quotation marks.
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })
})

// 1 − 734/1250 is 41.28%, which every surface prints as 41.3.
const PROGRESS = { pieces: 52, remaining: 734, backtracks: 18, ms: 1400, total: 1250 }

describe('RunStatusBar while a carve reports', () => {
  it('says the whole progress, percent included', async () => {
    const screen = await mountBar()
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().run.progressed(PROGRESS)
    })
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('41.3% · 52 arrows · 734 left · backtracks 18 · 1.4 s')
  })

  // The decimals follow the language, as Generate's label and the line do.
  it('writes the decimals the Polish way', async () => {
    useStore.getState().lang.setLang('pl')
    try {
      const screen = await mountBar()
      await act(async () => {
        useStore.getState().run.started(useStore.getState().params.values)
        useStore.getState().run.progressed(PROGRESS)
      })
      await expect
        .element(screen.getByRole('status'))
        .toHaveTextContent('41,3% · 52 strz. · zostało 734 · nawroty 18 · 1,4 s')
    } finally {
      useStore.getState().lang.setLang('en')
    }
  })
})

/** The two visible lines `useRunState` gives the columns, printed for reading. */
function Lines() {
  const { run, library } = useRunState()
  return (
    <>
      <p data-line="run" data-bad={String(run.bad)}>
        {run.text}
      </p>
      {library === null ? null : (
        <p data-line="library" data-bad={String(library.bad)}>
          {library.text}
        </p>
      )}
    </>
  )
}

async function mountLines(path = '/') {
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <RunStatusBar />
      <Lines />
    </MemoryRouter>,
  )
  const line = (which: 'run' | 'library') => screen.container.querySelector(`[data-line="${which}"]`)
  return { screen, line }
}

// One function says the state three times (`useRunState`); these pin where
// the three agree and the two places they differ.
describe('the lines the columns show', () => {
  it('say what the live region says, when no carve runs', async () => {
    const { screen, line } = await mountLines()
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    })
    await expect.element(screen.getByRole('status')).toMatchTextContent(/^Board complete: every cell filled\./)
    expect(line('run')?.textContent).toBe(screen.getByRole('status').element().textContent)
    expect(line('run')?.getAttribute('data-bad')).toBe('false')
    expect(line('library')).toBeNull()
  })

  it('drop the percent, which Generate carries, while a carve runs', async () => {
    const { line } = await mountLines()
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().run.progressed(PROGRESS)
    })
    expect(line('run')?.textContent).toBe('52 arrows · 734 left · backtracks 18 · 1.4 s')
  })

  it('mark the refusal and a failed run as bad', async () => {
    const { line } = await mountLines()
    await act(async () => useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 }))
    expect(line('run')?.textContent).toBe(EN.t('generateBlocked'))
    expect(line('run')?.getAttribute('data-bad')).toBe('true')
    await act(async () => {
      useStore.getState().params.reset()
      useStore.getState().run.failed('boom')
    })
    expect(line('run')?.textContent).toBe(`${EN.t('generationError')} boom`)
    expect(line('run')?.getAttribute('data-bad')).toBe('true')
  })

  // On the saved boards the board column has its own line for the library's
  // events and failures; the run column keeps talking about the run.
  it('give the library its own line on the saved boards, and only there', async () => {
    const { screen, line } = await mountLines('/boards')
    for (const [notice, bad] of [
      [{ kind: 'loading', name: '8x8/x' }, 'false'],
      [{ kind: 'viewSaved', name: '8x8/x' }, 'false'],
      [{ kind: 'deleted', name: '8x8/x' }, 'false'],
      [{ kind: 'saveFailed' }, 'true'],
      [{ kind: 'deleteFailed' }, 'true'],
    ] as const) {
      await act(async () => useStore.getState().library.notify(notice))
      expect(line('library')?.textContent, notice.kind).toBe(screen.getByRole('status').element().textContent)
      expect(line('library')?.getAttribute('data-bad'), notice.kind).toBe(bad)
      expect(line('run')?.textContent, notice.kind).toBe(EN.t('pressGenerate'))
    }
    await act(async () => {
      useStore.getState().library.clearNotice()
      useStore.getState().library.boardFailed({ name: '8x8/sha256-ab', reason: 'HTTP 404' })
    })
    expect(line('library')?.textContent).toBe(screen.getByRole('status').element().textContent)
    expect(line('library')?.getAttribute('data-bad')).toBe('true')
  })

  // A stored board's description is the live region's alone: its facts are in
  // the board column already.
  it('leave a stored board to the live region', async () => {
    const { meta, file } = storedFixture(1)
    const { screen, line } = await mountLines(`/boards/8x8/${meta.id}`)
    await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)
    expect(line('library')).toBeNull()
  })

  it('say nothing of the library while the lab is the tab', async () => {
    const { line } = await mountLines('/')
    await act(async () => useStore.getState().library.notify({ kind: 'deleted', name: '8x8/x' }))
    expect(line('library')).toBeNull()
  })
})
