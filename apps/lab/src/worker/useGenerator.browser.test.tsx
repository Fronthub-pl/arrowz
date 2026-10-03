import { defaultParams } from '@arrowz/engine'
import type { BoardFile, WorkerOut } from '@arrowz/engine'
import { useEffect, act } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { finishedRun } from '../state/result.fixtures'
import type { DoneReport, RunIntent } from '../state/run.slice'
import { useStore } from '../state/store'
import { useGenerator, type GeneratorHandle } from './useGenerator'

/** A plain run: nothing to save, no stored layout. */
const DRY: RunIntent = { save: false, storedId: null }

function Harness({ drive }: { drive: (g: GeneratorHandle) => void | (() => void) }) {
  const generator = useGenerator()
  useEffect(() => drive(generator), [generator, drive])
  return null
}

const start = (params: Parameters<GeneratorHandle['start']>[0]) => (g: GeneratorHandle) => g.start(params, DRY)

// Each test states its own timeout: Vitest's default 5 s is shorter than the
// polls, whose failure would then name nothing. Budget = polls + fixed waits
// + 8 s; CI runs several times slower than the dev machine (600×600: 2.7 s),
// so the slack is in the polls.

test('a run carves a board and lands in done', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 16, H: 16, seed: 5 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const { shown } = useStore.getState().result
  expect(shown?.board.W).toBe(16)
  // The `BoardFile` carries the board's fingerprint.
  expect(shown?.file.format).toBe('arrowz-board')
  expect(shown?.report.pieces).toBe(shown?.board.pieces.length)
}, 30_000)

// Outside the envelope (pStraight's floor is 0.6, in `PARAM_SPEC`) the worker
// throws InvalidParamsError, and the page must show it, not hang in `running`.
test('parameters outside the envelope end in error with the engine message', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 12, H: 12, pStraight: 0 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('error')
  expect(useStore.getState().run.message ?? '').not.toBe('')
}, 30_000)

// Unguarded, a decode throw would strand the page in `running` (see
// `useGenerator`). A stub worker, because a corrupt file cannot be carved to order.
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
    aborted: false,
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

// Without isolation there is no shared flag, so Stop is today's terminate.
test('without isolation, abort terminates the worker and nothing arrives afterwards', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  vi.stubGlobal('crossOriginIsolated', false)
  const terminate = vi.spyOn(Worker.prototype, 'terminate')
  try {
    await render(
      <Harness
        drive={(g) => {
          g.start({ ...defaultParams(), W: 200, H: 200, seed: 9 }, DRY)
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
  } finally {
    terminate.mockRestore()
    vi.unstubAllGlobals()
  }
}, 30_000)

// 600×600 for the reason the progress case below gives: it traces on a fast machine.
test('Stop on a traced run hands back the board laid so far', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  const handle = await mountHandle()
  await act(async () => handle().start({ ...defaultParams(), W: 600, H: 600, seed: 11 }, DRY))
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await act(async () => handle().abort())
  expect(useStore.getState().run.stopping).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const shown = useStore.getState().result.shown
  expect(shown?.report.aborted).toBe(true)
  expect(shown?.report.ok).toBe(false)
  expect(shown?.board.pieces.length ?? 0).toBeGreaterThan(0)
  expect(useStore.getState().run.stopping).toBe(false)
}, 60_000)

test('a second Stop while stopping discards the run', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => handle().start({ ...defaultParams(), W: 16, H: 16, seed: 5 }, DRY))
    await act(async () => handle().abort())
    expect(useStore.getState().run.stopping).toBe(true)
    await act(async () => handle().abort())
    expect(useStore.getState().run.phase).toBe('idle')
    expect(useStore.getState().run.wasAborted).toBe(true)
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

// The flag is read only while laying arrows: a run already past that (or one
// too small to trace) answers a plain `done`, which must end the stop.
test('a run that finishes unstopped after Stop ends the stop request', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => handle().start({ ...defaultParams(), W: 8, H: 8, seed: 1 }, DRY))
    await act(async () => handle().abort())
    const { report, file } = finishedRun(1)
    const data: WorkerOut = { ...report, board: file }
    await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
    expect(useStore.getState().run.phase).toBe('done')
    expect(useStore.getState().run.stopping).toBe(false)
    expect(useStore.getState().result.shown?.report.aborted).toBe(false)
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

// 600×600: the carver traces no sooner than 250 ms in (its `run` loop), and
// 200×200 finishes in 228 ms with no progress at all. 600 (2.5 s here) still
// traces on a machine nine times faster; 400 falls silent at about three.
test('a large run reports progress before it finishes', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 600, H: 600, seed: 11 })} />)
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.progress).toBeNull()
}, 60_000)

/** A worker that answers only when a case makes it, and records every one made. */
class HeldWorker {
  static made: HeldWorker[] = []
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted = 0
  constructor() {
    HeldWorker.made.push(this)
  }
  postMessage() {
    this.posted++
  }
  terminate() {}
}

/** The hook's handle, captured once it mounts. */
async function mountHandle(): Promise<() => GeneratorHandle> {
  let handle: GeneratorHandle | null = null
  await render(
    <Harness
      drive={(g) => {
        handle = g
      }}
    />,
  )
  return () => {
    if (handle === null) throw new Error('the harness did not mount')
    return handle
  }
}

// `terminate()` empties the port's queue, but a message already queued as a
// task can still arrive; the stub keeps delivering to show the guard holds.
test('a message from a worker already replaced changes nothing', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => {
      handle().start({ ...defaultParams(), W: 16, H: 16, seed: 5 }, DRY)
      handle().abort()
      handle().start({ ...defaultParams(), W: 16, H: 16, seed: 6 }, DRY)
    })
    expect(HeldWorker.made).toHaveLength(2)
    const data: WorkerOut = { type: 'error', message: 'from the old worker' }
    await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
    expect(useStore.getState().run.phase).toBe('running')
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

// A module worker whose chunk failed to load answers only `error`, never a message.
test('after a worker error the next run builds a new worker', async () => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  try {
    const handle = await mountHandle()
    await act(async () => handle().start({ ...defaultParams(), W: 16, H: 16, seed: 5 }, DRY))
    await act(async () => HeldWorker.made[0]?.onerror?.(new ErrorEvent('error', { message: 'chunk 404' })))
    expect(useStore.getState().run.phase).toBe('error')
    await act(async () => handle().start({ ...defaultParams(), W: 16, H: 16, seed: 6 }, DRY))
    expect(HeldWorker.made).toHaveLength(2)
    expect(HeldWorker.made[1]?.posted).toBe(1)
  } finally {
    vi.unstubAllGlobals()
  }
}, 15_000)

test('a start hands the run slice its intent to save', async () => {
  const handle = await mountHandle()
  await act(async () => handle().start({ ...defaultParams(), W: 8, H: 8, seed: 1 }, { save: true, storedId: null }))
  expect(useStore.getState().run.save).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  expect(useStore.getState().result.shown?.save).toBe(true)
}, 30_000)
