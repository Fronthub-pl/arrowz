import { defaultParams } from '@fronthub/arrowz-engine'
import type { WorkerIn, WorkerOut } from '@fronthub/arrowz-engine'
import { act, useEffect } from 'react'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useStore } from '../state/store'
import { type SeriesHandle, useSeries } from './useSeries'

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
  /** Answers its last seed with the given outcome. */
  answer(outcome: 'complete' | 'stopped' = 'complete') {
    const last = this.sent.at(-1)
    if (last?.type !== 'seed') throw new Error('nothing to answer')
    const data: WorkerOut = {
      type: 'seedDone',
      run: { seed: last.params.seed, outcome, pieces: 1, maxLen: 2, genMs: 3, remaining: 0 },
    }
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

let handle: SeriesHandle | null = null
function Harness() {
  const series = useSeries()
  useEffect(() => {
    handle = series
  }, [series])
  return null
}
const series = () => useStore.getState().series
const h = () => {
  if (handle === null) throw new Error('not mounted')
  return handle
}

beforeEach(async () => {
  series().reset()
  HeldWorker.made = []
  vi.stubGlobal('Worker', HeldWorker)
  vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8 })
  await render(<Harness />)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const seedsSent = () =>
  HeldWorker.made.flatMap((w) => w.sent.flatMap((m) => (m.type === 'seed' ? [m.params.seed] : [])))

test('the pool is capped at four and each seed goes out once', async () => {
  series().setCount(6)
  await act(async () => h().start({ ...defaultParams(), seed: 100 }))
  expect(HeldWorker.made).toHaveLength(4)
  expect(seedsSent()).toEqual([100, 101, 102, 103])
  await act(async () => HeldWorker.made[2]?.answer())
  expect(HeldWorker.made[2]?.sent.map((m) => (m.type === 'seed' ? m.params.seed : null))).toEqual([102, 104])
  expect(seedsSent()).toHaveLength(5)
})

test('answers out of order end in seed order, and the pool is terminated at the end', async () => {
  series().setCount(2)
  await act(async () => h().start({ ...defaultParams(), seed: 5 }))
  await act(async () => HeldWorker.made[1]?.answer())
  await act(async () => HeldWorker.made[0]?.answer())
  expect(series().phase).toBe('done')
  expect(series().runs.map((r) => r.seed)).toEqual([5, 6])
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('the first Stop sends no more seeds and keeps what was answered', async () => {
  series().setCount(10)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.answer())
  await act(async () => h().abort())
  expect(series().stopping).toBe(true)
  const before = seedsSent().length
  for (const w of HeldWorker.made.slice(1)) await act(async () => w.answer('stopped'))
  await act(async () => HeldWorker.made[0]?.answer('stopped'))
  expect(seedsSent().length).toBe(before)
  expect(series().phase).toBe('done')
  expect(series().runs.filter((r) => r.outcome === 'complete')).toHaveLength(1)
})

test('the second Stop terminates the pool at once', async () => {
  series().setCount(10)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => h().abort())
  await act(async () => h().abort())
  expect(series().phase).toBe('done')
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

test('the seeds carry the knobs of the start, not later edits', async () => {
  series().setCount(2)
  const params = { ...defaultParams(), W: 30, seed: 1 }
  await act(async () => h().start(params))
  const sent = HeldWorker.made[0]?.sent[0]
  expect(sent?.type === 'seed' && sent.params.W).toBe(30)
  expect(series().params?.W).toBe(30)
})

test('a worker error ends the series with the message', async () => {
  series().setCount(4)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  const data: WorkerOut = { type: 'error', message: 'nope' }
  await act(async () => HeldWorker.made[0]?.onmessage?.(new MessageEvent('message', { data })))
  expect(series().phase).toBe('done')
  expect(series().error).toBe('nope')
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})

// A browser's `onerror` does not reliably carry a `message` (some throw a plain
// Event); `end(undefined)` there would read as the same call a clean finish
// makes, so a load failure before any answer would look like success.
test('a worker onerror with no message still ends the series with a non-null error', async () => {
  series().setCount(4)
  await act(async () => h().start({ ...defaultParams(), seed: 1 }))
  await act(async () => HeldWorker.made[0]?.onerror?.({} as ErrorEvent))
  expect(series().phase).toBe('done')
  expect(series().error).not.toBeNull()
  expect(HeldWorker.made.every((w) => w.terminated)).toBe(true)
})
