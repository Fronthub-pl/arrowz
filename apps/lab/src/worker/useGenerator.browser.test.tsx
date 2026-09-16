import { defaultParams } from '@arrowz/engine'
import type { BoardFile, WorkerOut } from '@arrowz/engine'
import { useEffect } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { DoneReport } from '../state/run.slice'
import { useStore } from '../state/store'
import { useGenerator, type GeneratorHandle } from './useGenerator'

function Harness({ drive }: { drive: (g: GeneratorHandle) => void | (() => void) }) {
  const generator = useGenerator()
  useEffect(() => drive(generator), [generator, drive])
  return null
}

const start = (params: Parameters<GeneratorHandle['start']>[0]) => (g: GeneratorHandle) => g.start(params)

// Every test here states its own timeout, because the chromium project sets no
// `testTimeout` and Vitest's default is 5 s — shorter than the poll budgets
// below, which would make the polls decorative and the failure a timeout that
// names nothing. Each budget is the sum of the test's polls and fixed waits
// plus 8 s. CI carves on a GPU-less two-core runner, several times slower than
// the machine these were measured on (16×16: 61 ms, abort: 2.06 s of which
// 2.0 s is the fixed wait, 600×600: 2.71 s), so the slack is in the polls.

test('a run carves a board and lands in done', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 16, H: 16, seed: 5 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const { shown } = useStore.getState().result
  expect(shown?.board.W).toBe(16)
  // BoardFile is an object (types.ts:151); its fingerprint is the board's.
  expect(shown?.file.format).toBe('arrowz-board')
  expect(shown?.report.pieces).toBe(shown?.board.pieces.length)
}, 30_000)

// The worker throws InvalidParamsError for parameters outside the envelope
// (pStraight's floor is 0.6, engine.ts:2452), and the page must show that
// message rather than hang in `running`.
test('parameters outside the envelope end in error with the engine message', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 12, H: 12, pStraight: 0 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('error')
  expect(useStore.getState().run.message ?? '').not.toBe('')
}, 30_000)

// A board file the codec cannot read is a codec bug, and the reference shows it
// rather than hiding it (lab-page.ts:794-806). What makes it worth a test is
// the failure mode of the unguarded version: decodeBoard throws out of
// `onmessage` after `busy` is already cleared, so the slice stays in `running`
// with no message, Generate stays disabled and abort() returns early — the
// page has no way out but a reload. A stub worker stands in for the real one
// because a genuinely corrupt file cannot be carved to order.
test('a board file the codec rejects ends in error, not in a stuck run', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  const file: BoardFile = {
    format: 'arrowz-board',
    v: 1,
    W: 4,
    H: 4,
    pieces: 1,
    voids: 0,
    unfilled: 0,
    fingerprint: 'nope',
    body: 'not-base64!!',
  }
  const done: DoneReport = {
    type: 'done',
    ok: true,
    metrics: null,
    backtracks: 0,
    restartsUsed: 0,
    genMs: 1,
    metricsMs: 0,
    totalMs: 1,
    stuck: null,
    deadlock: false,
    pieces: 1,
    stats: { want: 1, got: 1, stall: 0, strandTrunc: 0, strandLoss: 0, n: 1 },
    board: file,
  }
  class StubWorker {
    onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage() {
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: done })), 0)
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', StubWorker)
  try {
    await render(<Harness drive={start({ ...defaultParams(), W: 16, H: 16, seed: 5 })} />)
    await expect.poll(() => useStore.getState().run.phase, { timeout: 5_000 }).toBe('error')
    // BoardFileError's own words, so the page shows the cause and not a label.
    expect(useStore.getState().run.message ?? '').toContain('base64')
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

// Abort must terminate the worker, not merely relabel the slice: a live worker
// would deliver `done` afterwards and drag the run back out of idle. The wait
// is longer than the board takes, so a missing terminate() shows up.
test('abort terminates the worker, and nothing arrives afterwards', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  const terminate = vi.spyOn(Worker.prototype, 'terminate')
  await render(
    <Harness
      drive={(g) => {
        g.start({ ...defaultParams(), W: 200, H: 200, seed: 9 })
        const id = setTimeout(() => g.abort(), 30)
        return () => clearTimeout(id)
      }}
    />,
  )
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('idle')
  expect(terminate).toHaveBeenCalled()
  await new Promise((done) => setTimeout(done, 2_000))
  expect(useStore.getState().run.phase).toBe('idle')
  expect(useStore.getState().result.shown).toBeNull()
  terminate.mockRestore()
}, 30_000)

// Progress is what the status line lives on during a long carve. 600×600 and
// not 200×200: the engine traces no sooner than 250 ms into a carve
// (engine.ts:1869), and in Chromium 200×200 finishes in 228 ms and emits
// nothing at all. Measured here: 200 → 0 updates (228 ms), 300 → 1 (478 ms),
// 400 → 2 (861 ms), 600 → 8 (2 507 ms). The gate is wall-clock, so the size is
// chosen for headroom against a faster machine, not against the poll: 600
// still traces on a machine about nine times faster than this one (a 2 227 ms
// carve against the 250 ms gate), where 400 falls silent at about three.
test('a large run reports progress before it finishes', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 600, H: 600, seed: 11 })} />)
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.progress).toBeNull()
}, 60_000)
