import { defaultParams, type Params } from '@fronthub/arrowz-engine'
import { boardId } from '@fronthub/arrowz-engine/command'
import { beforeEach, expect, test } from 'vitest'
import { doneMessage, fakeWorkers } from '../harness/docsWorkers'
import { createDocsQueue, type DocsJob, type DocsRun } from './docsQueue'

const board = (W: number, seed = 7): Params => ({ ...defaultParams(), W, H: W, seed })
const keyOf = (params: Params) => boardId(params)

let workers: ReturnType<typeof fakeWorkers>
let cache: Map<string, DocsRun>
beforeEach(() => {
  workers = fakeWorkers()
  cache = new Map()
})

/** Every state a listener heard, in order. */
function heard(): { states: DocsJob['state'][]; listener: (job: DocsJob) => void } {
  const states: DocsJob['state'][] = []
  return { states, listener: (job) => states.push(job.state) }
}

const generated = (i = 0) => (workers.made[i]?.posted ?? []).flatMap((m) => (m.type === 'generate' ? [m.params.W] : []))

test('one board at a time, in the order they were asked for', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  queue.request(keyOf(a), a, () => {})
  queue.request(keyOf(b), b, () => {})
  expect(generated()).toEqual([6])
  workers.made[0]?.answer(doneMessage(a))
  expect(generated()).toEqual([6, 8])
})

test('a listener hears waiting or running, then done with the board', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const first = heard()
  const second = heard()
  queue.request(keyOf(a), a, first.listener)
  queue.request(keyOf(b), b, second.listener)
  workers.made[0]?.answer(doneMessage(a))
  expect(first.states).toEqual(['running', 'done'])
  expect(second.states).toEqual(['waiting', 'running'])
  expect(queue.cached(keyOf(a))?.board.W).toBe(6)
})

test('a board made this session answers at once, without the worker', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  queue.request(keyOf(a), a, () => {})
  workers.made[0]?.answer(doneMessage(a))
  const again = heard()
  queue.request(keyOf(a), a, again.listener)
  expect(again.states).toEqual(['done'])
  expect(generated()).toEqual([6])
})

test('withdrawing a waiting request drops it from the queue', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const c = board(10)
  queue.request(keyOf(a), a, () => {})
  const withdraw = queue.request(keyOf(b), b, () => {})
  queue.request(keyOf(c), c, () => {})
  withdraw()
  workers.made[0]?.answer(doneMessage(a))
  expect(generated()).toEqual([6, 10])
})

test('withdrawing the running request still keeps its board', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const listener = heard()
  const withdraw = queue.request(keyOf(a), a, listener.listener)
  withdraw()
  workers.made[0]?.answer(doneMessage(a))
  expect(listener.states).toEqual(['running'])
  expect(queue.cached(keyOf(a))).toBeDefined()
})

test('two requests for one board share one run', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const one = heard()
  const two = heard()
  queue.request(keyOf(a), a, one.listener)
  queue.request(keyOf(a), a, two.listener)
  workers.made[0]?.answer(doneMessage(a))
  expect(generated()).toEqual([6])
  expect(one.states).toEqual(['running', 'done'])
  expect(two.states).toEqual(['running', 'done'])
})

test('two requests for a board still in line share its one run', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const one = heard()
  const two = heard()
  queue.request(keyOf(a), a, () => {})
  queue.request(keyOf(b), b, one.listener)
  queue.request(keyOf(b), b, two.listener)
  workers.made[0]?.answer(doneMessage(a))
  workers.made[0]?.answer(doneMessage(b))
  expect(generated()).toEqual([6, 8])
  expect(one.states).toEqual(['waiting', 'running', 'done'])
  expect(two.states).toEqual(['waiting', 'running', 'done'])
})

test('an error fails that board only, the next one runs, and asking again asks the worker again', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const failed = heard()
  queue.request(keyOf(a), a, failed.listener)
  queue.request(keyOf(b), b, () => {})
  workers.made[0]?.answer({ type: 'error', message: 'no room' })
  expect(failed.states).toEqual(['running', 'failed'])
  expect(generated()).toEqual([6, 8])
  workers.made[0]?.answer(doneMessage(b))
  queue.request(keyOf(a), a, () => {})
  expect(generated()).toEqual([6, 8, 6])
})

test('a worker that fails to load is replaced on the next request', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const failed = heard()
  queue.request(keyOf(a), a, failed.listener)
  workers.made[0]?.fail('could not load')
  expect(failed.states).toEqual(['running', 'failed'])
  expect(workers.made[0]?.terminated).toBe(true)
  queue.request(keyOf(a), a, () => {})
  expect(workers.made).toHaveLength(2)
  expect(generated(1)).toEqual([6])
})

// StrictMode runs every cleanup once on mount: the provider disposes, then
// its boards ask again. A disposed queue must start a fresh worker.
test('dispose stops the worker and forgets the queue, and the queue still works after', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const dropped = heard()
  queue.request(keyOf(a), a, dropped.listener)
  queue.request(keyOf(b), b, () => {})
  queue.dispose()
  expect(workers.made[0]?.terminated).toBe(true)
  workers.made[0]?.answer(doneMessage(a))
  expect(dropped.states).toEqual(['running'])
  expect(queue.cached(keyOf(a))).toBeUndefined()
  queue.request(keyOf(b), b, () => {})
  expect(generated(1)).toEqual([8])
})

test('a board that is not complete is kept as it came', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  queue.request(keyOf(a), a, () => {})
  workers.made[0]?.answer(doneMessage(a, false))
  expect(queue.cached(keyOf(a))?.report.ok).toBe(false)
})
