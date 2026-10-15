import { defaultParams } from '@fronthub/arrowz-engine'
import type { BoardFile, SeedRun, StoreRequest, WorkerIn, WorkerOut } from '@fronthub/arrowz-engine'
import { act, useEffect } from 'react'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useStore } from '../state/store'
import { type FillHandle, useFill } from './useFill'

/** A board file as the played store takes it; nothing here reads its body. */
const FILE: BoardFile = {
  format: 'arrowz-board',
  v: 1,
  W: 4,
  H: 4,
  pieces: 1,
  voids: 0,
  unfilled: 0,
  fingerprint: 'f',
  body: '',
}

/** A worker that answers only when a case makes it, recording what it was sent. */
class HeldWorker {
  static made: HeldWorker[] = []
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: WorkerIn[] = []
  terminated = false
  constructor() {
    HeldWorker.made.push(this)
  }
  postMessage(message: WorkerIn) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  /** Answers its last seed; a complete seed comes with a board file unless a case says otherwise. */
  answer(outcome: SeedRun['outcome'] = 'complete', board: BoardFile | null = outcome === 'complete' ? FILE : null) {
    const last = this.sent.at(-1)
    if (last?.type !== 'fill') throw new Error('nothing to answer')
    const data: WorkerOut = {
      type: 'fillDone',
      run: {
        seed: last.params.seed,
        outcome,
        pieces: 1,
        maxLen: 2,
        genMs: 3,
        remaining: outcome === 'complete' ? 0 : 5,
      },
      board,
      restarts: 0,
      backtracks: 4,
    }
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

type StoreAnswer = 'new' | 'known' | 'stale' | 'refused' | 'down'

async function reply(answer: StoreAnswer): Promise<Response> {
  if (answer === 'down') throw new TypeError('Failed to fetch')
  if (answer === 'refused') return new Response(JSON.stringify({ error: 'disk full' }), { status: 500 })
  if (answer === 'stale') return new Response(JSON.stringify({ id: 'sha256-x' }), { status: 201 })
  const body = { meta: { id: 'sha256-x' }, layoutExisted: answer === 'known', recipeExisted: false }
  return new Response(JSON.stringify(body), { status: 201 })
}

/**
 * The store as a case plays it: each POST takes the next answer, a listing is
 * empty. No request leaves the page. `held` keeps each POST waiting until the
 * case calls `release`.
 */
function playStore(answers: StoreAnswer[], { held = false } = {}) {
  const posted: StoreRequest[] = []
  const waiting: (() => void)[] = []
  let listings = 0
  vi.stubGlobal('fetch', async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method !== 'POST') {
      listings++
      return new Response('[]', { status: 200 })
    }
    posted.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}') as StoreRequest)
    const answer = () => reply(answers.shift() ?? 'new')
    if (!held) return answer()
    return new Promise<Response>((resolve, reject) => waiting.push(() => void answer().then(resolve, reject)))
  })
  const release = () => {
    const next = waiting.shift()
    if (next === undefined) throw new Error('no save is waiting')
    next()
  }
  return { posted, listings: () => listings, release }
}

let handle: FillHandle | null = null
function Harness() {
  const fill = useFill()
  useEffect(() => {
    handle = fill
  }, [fill])
  return null
}
const fill = () => useStore.getState().fill
const h = () => {
  if (handle === null) throw new Error('not mounted')
  return handle
}
/** Every seed sent so far, in seed order: a seed goes to whichever worker is idle first. */
const seedsSent = () =>
  HeldWorker.made
    .flatMap((w) => w.sent.flatMap((m) => (m.type === 'fill' ? [m.params.seed] : [])))
    .sort((a, b) => a - b)
/** Polled, not read: a save answers after the act that posted it. */
const stored = (n: number) => expect.poll(() => fill().written + fill().alreadyStored.length).toBe(n)
/** Before asserting that nothing happened: lets every promise chain of a save close. */
const settle = () => new Promise((done) => setTimeout(done, 50))
const COLORED = useStore.getState().view.colored

beforeEach(async () => {
  fill().reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8 })
  await render(<Harness />)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useStore.getState().view.setFlag('colored', COLORED)
})

test('no more seeds go out than boards still wanted, and a seed that is not complete makes room', async () => {
  playStore([])
  fill().setCount(2)
  await act(async () => h().start({ ...defaultParams(), seed: 10 }))
  expect(HeldWorker.made).toHaveLength(2)
  expect(seedsSent()).toEqual([10, 11])
  expect(HeldWorker.made[0]?.sent[0]).toMatchObject({ type: 'fill', stop: expect.any(Int32Array) })
  await act(async () => HeldWorker.made[0]?.answer())
  await stored(1)
  expect(seedsSent()).toEqual([10, 11])
  await act(async () => HeldWorker.made[1]?.answer('incomplete'))
  expect(seedsSent()).toEqual([10, 11, 12])
  expect(fill().notComplete).toEqual([11])
})

test('a layout already stored does not count, and the next seed is tried', async () => {
  const store = playStore(['known', 'new'])
  fill().setCount(1)
  await act(async () => h().start({ ...defaultParams(), seed: 5 }))
  expect(seedsSent()).toEqual([5])
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => seedsSent()).toEqual([5, 6])
  expect(fill().alreadyStored).toEqual([5])
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => fill().phase).toBe('done')
  expect(fill().written).toBe(1)
  expect(store.posted.map((r) => r.params.seed)).toEqual([5, 6])
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
  expect(store.listings()).toBe(1)
})

test('the batch gives up at its seed limit and posts nothing for boards that are not complete', async () => {
  const store = playStore([])
  fill().setCount(2)
  fill().setMaxSeeds(2)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer('incomplete'))
  await act(async () => HeldWorker.made[1]?.answer('incomplete'))
  expect(fill()).toMatchObject({ phase: 'done', written: 0, tried: 2, limit: 2, notComplete: [1, 2], error: null })
  expect(seedsSent()).toEqual([1, 2])
  expect(store.posted).toEqual([])
  expect(store.listings()).toBe(0)
})

// The worker hands back no board for such a seed; this pins the page's own check.
test('a seed that is not complete is never saved, even when its answer carries a board', async () => {
  const store = playStore([])
  fill().setCount(1)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer('incomplete', FILE))
  await settle()
  expect(store.posted).toEqual([])
  expect(fill()).toMatchObject({ tried: 1, written: 0, notComplete: [1] })
  expect(seedsSent()).toEqual([1, 2])
})

test('saves go to the store one at a time in the order the seeds finished, each holding its seed back', async () => {
  const store = playStore([], { held: true })
  fill().setCount(2)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[1]?.answer())
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => store.posted.length).toBe(1)
  await settle()
  expect(store.posted.map((r) => r.params.seed)).toEqual([2])
  expect(seedsSent()).toEqual([1, 2])
  store.release()
  await expect.poll(() => store.posted.length).toBe(2)
  expect(store.posted.map((r) => r.params.seed)).toEqual([2, 1])
  expect(seedsSent()).toEqual([1, 2])
  store.release()
  await expect.poll(() => fill().phase).toBe('done')
  expect(fill().written).toBe(2)
  expect(store.listings()).toBe(1)
})

test('a store that cannot be reached ends the batch with its message and terminates the pool', async () => {
  playStore(['down'])
  fill().setCount(3)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => fill().phase).toBe('done')
  expect(fill().error).toEqual({ kind: 'store', message: 'Failed to fetch' })
  expect(fill().written).toBe(0)
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('a store that refuses a board ends the batch with its message', async () => {
  playStore(['refused'])
  fill().setCount(3)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => fill().phase).toBe('done')
  expect(fill().error).toEqual({ kind: 'store', message: 'disk full' })
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('a failed save ends the batch before the board queued behind it is posted', async () => {
  const store = playStore(['down'], { held: true })
  fill().setCount(3)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await act(async () => HeldWorker.made[1]?.answer())
  await expect.poll(() => store.posted.length).toBe(1)
  store.release()
  await expect.poll(() => fill().phase).toBe('done')
  await settle()
  expect(store.posted).toHaveLength(1)
  expect(fill()).toMatchObject({ written: 0, error: { kind: 'store', message: 'Failed to fetch' } })
})

test('an older store server ends the batch, saying so, and the list is fetched again', async () => {
  const store = playStore(['stale'])
  fill().setCount(3)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => fill().phase).toBe('done')
  expect(fill().error).toEqual({ kind: 'stale' })
  expect(store.listings()).toBe(1)
})

test('the first Stop sends no more seeds and keeps the boards already saved', async () => {
  playStore([])
  fill().setCount(5)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  expect(HeldWorker.made).toHaveLength(4)
  await act(async () => HeldWorker.made[0]?.answer())
  await stored(1)
  await act(async () => h().abort())
  expect(fill().stopping).toBe(true)
  const before = seedsSent().length
  for (const w of HeldWorker.made) await act(async () => w.answer('stopped'))
  expect(seedsSent().length).toBe(before)
  expect(fill()).toMatchObject({ phase: 'done', written: 1, tried: 1, stopping: false })
})

test('a board completed after the first Stop is still saved and counted', async () => {
  const store = playStore([])
  fill().setCount(5)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => h().abort())
  await act(async () => HeldWorker.made[2]?.answer())
  await stored(1)
  for (const w of [0, 1, 3]) await act(async () => HeldWorker.made[w]?.answer('stopped'))
  await expect.poll(() => fill().phase).toBe('done')
  expect(fill()).toMatchObject({ written: 1, tried: 1 })
  expect(store.posted.map((r) => r.params.seed)).toEqual([3])
  expect(seedsSent()).toEqual([1, 2, 3, 4])
})

test('the second Stop terminates the pool at once', async () => {
  playStore([])
  fill().setCount(5)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => h().abort())
  await act(async () => h().abort())
  expect(fill().phase).toBe('done')
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('after the second Stop a save on its way lands uncounted and lists the store again; one queued is not posted', async () => {
  const store = playStore([], { held: true })
  fill().setCount(5)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await act(async () => HeldWorker.made[1]?.answer())
  await expect.poll(() => store.posted.length).toBe(1)
  await act(async () => h().abort())
  await act(async () => h().abort())
  expect(fill().phase).toBe('done')
  expect(store.listings()).toBe(0)
  store.release()
  await expect.poll(() => store.listings()).toBe(1)
  await settle()
  expect(store.posted).toHaveLength(1)
  expect(fill().written).toBe(0)
})

test('each save carries its seed, the knobs and look of the start, and the lab as its source', async () => {
  const store = playStore([])
  fill().setCount(1)
  useStore.getState().view.setFlag('colored', true)
  await act(async () => h().start({ ...defaultParams(), W: 30, seed: 9 }))
  useStore.getState().view.setFlag('colored', false)
  await act(async () => HeldWorker.made[0]?.answer())
  await expect.poll(() => store.posted.length).toBe(1)
  const request = store.posted[0]
  expect(request?.params).toMatchObject({ W: 30, seed: 9 })
  expect(request?.source).toBe('lab')
  expect(request?.view).toMatchObject({ colored: true, top: 0 })
  expect(request?.metrics).toMatchObject({ ok: true, restarts: 0, backtracks: 4, aborted: false })
  expect(request?.command).toContain('--seed=9')
  expect(request?.board).toEqual(FILE)
})

test('a worker error ends the batch with the message', async () => {
  playStore([])
  fill().setCount(2)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  const data: WorkerOut = { type: 'error', message: 'nope' }
  await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
  expect(fill()).toMatchObject({ phase: 'done', error: { kind: 'worker', message: 'nope' } })
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})
