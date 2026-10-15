import type { WorkerOut } from '@fronthub/arrowz-engine'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { openPool } from './pool'

/** A worker that never answers on its own, recording whether it was terminated. */
class SilentWorker {
  static made: SilentWorker[] = []
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  constructor() {
    SilentWorker.made.push(this)
  }
  postMessage() {}
  terminate() {
    this.terminated = true
  }
}

beforeEach(() => {
  SilentWorker.made = []
  vi.stubGlobal('Worker', SilentWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('builds the workers asked for, and the kill terminates them all', () => {
  const pool = openPool(3, { message: vi.fn(), failed: vi.fn() })
  expect(pool.workers).toHaveLength(3)
  pool.kill()
  expect(SilentWorker.made.map((w) => w.terminated)).toEqual([true, true, true])
})

test('an answer is handed on with its worker, and nothing after the kill', () => {
  const message = vi.fn()
  const failed = vi.fn()
  const pool = openPool(1, { message, failed })
  const data: WorkerOut = { type: 'error', message: 'first' }
  SilentWorker.made[0]?.onmessage?.(new MessageEvent('message', { data }))
  expect(message).toHaveBeenCalledWith(pool.workers[0], data)
  pool.kill()
  SilentWorker.made[0]?.onmessage?.(new MessageEvent('message', { data: { type: 'error', message: 'late' } }))
  SilentWorker.made[0]?.onerror?.(new ErrorEvent('error'))
  expect(message).toHaveBeenCalledTimes(1)
  expect(failed).not.toHaveBeenCalled()
})

test('a worker that breaks is reported with an empty message, never undefined', () => {
  const failed = vi.fn()
  openPool(1, { message: vi.fn(), failed })
  SilentWorker.made[0]?.onerror?.(new ErrorEvent('error'))
  expect(failed).toHaveBeenCalledWith('')
})

// The test page is cross-origin isolated (the chromium project's ISOLATION headers).
test("the pool's stop flag is read through stopRequested", () => {
  const pool = openPool(2, { message: vi.fn(), failed: vi.fn() })
  if (pool.flag === null) throw new Error('expected a shared flag on an isolated page')
  expect(pool.stopRequested()).toBe(false)
  Atomics.store(pool.flag, 0, 1)
  expect(pool.stopRequested()).toBe(true)
})
