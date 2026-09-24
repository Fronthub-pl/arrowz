import { act, useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { defaultParams, encodeBoard, generate, PARAM_SPEC } from '@arrowz/engine'
import type { DoneReport } from '../state/run.slice'
import { useStore } from '../state/store'
import type { RunControl } from './useRun'
import { RunColumn } from './RunColumn'
// The real cascade, in `main.tsx`'s order: a case below measures where the command box clips.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

function stub() {
  const calls = { start: 0, abort: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => void calls.abort++, hold: () => {} }
  return { control, started: () => calls.start, aborted: () => calls.abort }
}

// A real finished run, so the focus cases end a carve through `completeRun()`
// rather than `aborted()`. 8×8 because nothing here reads the report.
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
 * which runs after the animation-frame callbacks of the same frame. Measured in
 * Chrome: with the fix removed, the focus is still off `<body>` in 18-20 of 20
 * samples at any point short of two frames, and on `<body>` in 20 of 20 after
 * two. Two is the floor, not a margin; do not shorten it.
 */
function twoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/** The route's two refs: without them the focus effect has nothing to aim at. */
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

  // The clamp notice parks the focus on Abort during a carve, and the commit
  // that ends it disables Abort. `toBe(Generate)` catches a deleted branch at
  // any point; `not.toBe(document.body)` needs the full `twoFrames` wait.
  it('carries the focus off Abort when the run that made it live ends', async () => {
    const g = stub()
    const screen = await render(<Host control={g.control} />)
    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    const abort = buttonOf(screen.getByRole('button', { name: 'Abort' }).element())
    abort.focus()
    // The precondition, so the case cannot pass with the focus on Generate all along.
    expect(document.activeElement).toBe(abort)

    await act(async () => useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED }))
    await twoFrames()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate' }).element())
  })

  // The mirror: starting a run is what disables Generate.
  it('carries the focus off Generate when starting a run is what disables it', async () => {
    const g = stub()
    const screen = await render(<Host control={g.control} />)
    const go = buttonOf(screen.getByRole('button', { name: 'Generate' }).element())
    go.focus()
    // The precondition, so the case cannot pass with the focus on Abort all along.
    expect(document.activeElement).toBe(go)

    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    await twoFrames()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abort' }).element())
  })

  // A real Enter: `control.start` writes `run.started` synchronously, so the
  // commit that disables Generate is the one flushed for this key press.
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

  // A fix that read `running` instead of its transition would pull the focus
  // away on every commit. Defaults is the probe: it is never disabled.
  it('leaves a focus that is on neither button where the user put it', async () => {
    const g = stub()
    const screen = await render(<Host control={g.control} />)
    const defaults = buttonOf(screen.getByRole('button', { name: 'Defaults' }).element())
    defaults.focus()
    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    // Asserted after the start too, so a start branch that grabbed the focus is caught directly.
    await twoFrames()
    expect(document.activeElement).toBe(defaults)
    await act(async () => useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED }))
    await twoFrames()
    expect(document.activeElement).toBe(defaults)
  })

  // Only visible here: the column's switch is the store's field, not local state.
  // A knob row opens its own description with its `?`, so no descriptions switch.
  it('flips the store from its switch, and has no descriptions switch', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await screen.getByRole('switch', { name: 'generate right after a change' }).click()
    expect(useStore.getState().ui.auto).toBe(true)
    expect(screen.getByRole('switch').elements()).toHaveLength(1)
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

  // The seed came from the machine, not from a hand, so it must not look like
  // an edit; otherwise `auto` starts a second run behind it.
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

  // Guards the draw in `reseed` from drifting past the spec, not the clamp:
  // the draw spans exactly the knob's 32 bits. Clamping is tested in the params slice.
  it('never draws a seed outside the knob', async () => {
    const spec = PARAM_SPEC.find((s) => s.key === 'seed')
    if (spec === undefined) throw new Error('PARAM_SPEC has no seed')
    const screen = await render(<RunColumn control={stub().control} />)
    for (let i = 0; i < 20; i++) await screen.getByRole('button', { name: 'New seed' }).click()
    const seed = useStore.getState().params.values.seed
    expect(seed).toBeGreaterThanOrEqual(spec.min)
    expect(seed).toBeLessThanOrEqual(spec.max)
  })

  // Neither button is disabled by a broken rule: the point of Defaults is to
  // escape one. New seed cannot, and says so through the status line instead.
  it('leaves Defaults usable while a rule is broken, and it clears the rule', async () => {
    const g = stub()
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={g.control} />)
    await screen.getByRole('button', { name: 'Defaults' }).click()
    expect(useStore.getState().params.violations).toHaveLength(0)
    expect(g.started()).toBe(1)
  })

  // Geometry, because `.fw-cmd`'s text is in the DOM whether or not the box
  // paints it. The box shows the whole command and the column scrolls instead,
  // so Generate moves down with a longer command. 216 px is about the stage's
  // narrowest run track.
  it('shows the whole command in its box, and the column scrolls to Generate', async () => {
    const screen = await render(
      <div className="fw" style={{ display: 'flex', width: '216px', height: '300px' }}>
        <RunColumn control={stub().control} />
      </div>,
    )
    const go = () => screen.getByRole('button', { name: 'Generate' }).element().getBoundingClientRect()
    const before = go().top
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
    const column = screen.container.querySelector('.fw-run-col')
    if (pre === null || column === null) throw new Error('the command box or the column is not on the page')
    // Nothing of the command is out of the box's sight…
    expect(pre.scrollHeight).toBeLessThanOrEqual(pre.clientHeight + 1)
    // …and the column is what overflows (else this case asserts nothing).
    // `overflow-y`, not `scrollTop`: an `overflow: hidden` box still scrolls programmatically.
    expect(column.scrollHeight).toBeGreaterThan(column.clientHeight)
    expect(getComputedStyle(column).overflowY).toBe('auto')
    // The box never paints over Generate, which followed the command down.
    expect(pre.getBoundingClientRect().bottom).toBeLessThanOrEqual(go().top)
    expect(go().top).toBeGreaterThan(before)
  })
})

// The exports belong to the board, not to the knobs, so the simple view keeps them.
describe('the exports', () => {
  it.each(['advanced', 'simple'] as const)('are in the column in the %s view', async (mode) => {
    useStore.getState().ui.setMode(mode)
    const screen = await render(<RunColumn control={stub().control} />)
    await expect.element(screen.getByRole('group', { name: 'Export' })).toBeInTheDocument()
  })
})

// 1 − 734/1250 is 41.28%, shown as 41.3.
const PROGRESS = { pieces: 52, remaining: 734, backtracks: 18, ms: 1400, total: 1250 }

/** The line under Generate: the column's one `p.fw-runstate`. */
function stateLine(container: HTMLElement): HTMLElement {
  const line = container.querySelector<HTMLElement>('.fw-run-col > p.fw-runstate')
  if (line === null) throw new Error('the column has no state line')
  return line
}

describe('Generate as the meter', () => {
  // Inside `.fw`, where the shell's rules live: both the fill and the
  // `:disabled` dimming it overrides are scoped to it (run.css).
  it('carries the share done in its label and its fill while a carve runs', async () => {
    const screen = await render(
      <div className="fw">
        <RunColumn control={stub().control} />
      </div>,
    )
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().run.progressed(PROGRESS)
    })
    const go = screen.getByRole('button', { name: 'Generating 41.3%' })
    await expect.element(go).toBeDisabled()
    await expect.element(go).toHaveClass('busy')
    expect(go.element().getAttribute('style')).toContain('--p: 41.3%')
    // Not dimmed like a refused Generate: it is working, not unavailable.
    expect(getComputedStyle(go.element()).opacity).toBe('1')
    expect(getComputedStyle(go.element()).backgroundImage).toContain('linear-gradient')
  })

  it('points at a progressbar that says the same to assistive technology', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().run.progressed(PROGRESS)
    })
    const bar = screen.getByRole('progressbar', { name: 'Run progress' })
    await expect.element(bar).toHaveAttribute('aria-valuenow', '41.3')
    await expect.element(bar).toHaveAttribute('aria-valuemin', '0')
    await expect.element(bar).toHaveAttribute('aria-valuemax', '100')
    await expect.element(bar).toHaveAttribute('aria-valuetext', '41.3%')
    const go = screen.getByRole('button', { name: 'Generating 41.3%' })
    await expect.element(go).toHaveAttribute('aria-describedby', bar.element().id)
  })

  // Before the worker's first report the share is unknown: no number is
  // invented, and the progressbar is indeterminate — it has no value.
  it('is indeterminate before the first report', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await act(async () => useStore.getState().run.started(useStore.getState().params.values))
    await expect.element(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled()
    const bar = screen.getByRole('progressbar', { name: 'Run progress' })
    expect(bar.element().hasAttribute('aria-valuenow')).toBe(false)
  })

  it('speaks Polish, with a decimal comma', async () => {
    useStore.getState().lang.setLang('pl')
    try {
      const screen = await render(<RunColumn control={stub().control} />)
      await act(async () => {
        useStore.getState().run.started(useStore.getState().params.values)
        useStore.getState().run.progressed(PROGRESS)
      })
      await expect.element(screen.getByRole('button', { name: 'Generuję 41,3%' })).toBeInTheDocument()
      await expect
        .element(screen.getByRole('progressbar', { name: 'Postęp generowania' }))
        .toHaveAttribute('aria-valuetext', '41,3%')
      expect(stateLine(screen.container).textContent).toBe('52 elem. · zostało 734 · nawroty 18 · 1,4 s')
    } finally {
      useStore.getState().lang.setLang('en')
    }
  })

  it('is Generate again, with no progressbar, once the run ends', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().run.progressed(PROGRESS)
    })
    await act(async () => useStore.getState().run.aborted())
    const go = screen.getByRole('button', { name: 'Generate', exact: true })
    await expect.element(go).not.toHaveClass('busy')
    expect(go.element().hasAttribute('aria-describedby')).toBe(false)
    expect(screen.container.querySelector('[role="progressbar"]')).toBeNull()
  })
})

describe('the state line under Generate', () => {
  // The percent is on Generate, so the line says the rest of the progress.
  it('says the rest of the progress while a carve runs', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().run.progressed(PROGRESS)
    })
    const line = stateLine(screen.container)
    expect(line.textContent).toBe('52 pieces · 734 left · backtracks 18 · 1.4 s')
    // Hidden from assistive technology: the live output says it (RunStatusBar).
    expect(line.getAttribute('aria-hidden')).toBe('true')
    // It sits between Generate and the alternatives.
    expect(line.previousElementSibling?.getAttribute('role')).toBe('progressbar')
    expect(line.nextElementSibling?.className).toBe('fw-alt')
  })

  it('says the last outcome once a run is done', async () => {
    const screen = await render(<RunColumn control={stub().control} />)
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    })
    await expect.poll(() => stateLine(screen.container).textContent).toMatch(/^Board closed 100%\./)
    expect(stateLine(screen.container).classList.contains('bad')).toBe(false)
  })

  // The refusal is drawn in --error: it is the one line that asks for action.
  it('says the refusal in the error colour while a rule is broken', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<RunColumn control={stub().control} />)
    const line = stateLine(screen.container)
    expect(line.textContent).toBe(screen.getByRole('button', { name: 'Generate' }).element().getAttribute('title'))
    expect(line.classList.contains('bad')).toBe(true)
    const probe = document.createElement('span')
    probe.style.color = 'var(--error)'
    screen.container.append(probe)
    expect(getComputedStyle(line).color).toBe(getComputedStyle(probe).color)
  })
})
