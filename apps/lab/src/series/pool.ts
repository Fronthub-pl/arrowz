import type { WorkerOut } from '@fronthub/arrowz-engine'

/** What a pool hands its owner: each answer with the worker that gave it, and a worker that broke. */
export interface PoolHandlers {
  message(worker: Worker, message: WorkerOut): void
  failed(error: string): void
}

/** The workers of one pool and the stop flag they share (null without cross-origin isolation). */
export interface Pool {
  readonly workers: readonly Worker[]
  readonly flag: Int32Array | null
  /** Whether Stop raised the shared flag. */
  stopRequested(): boolean
  /** Terminates every worker; an answer still queued from one reaches no handler. */
  kill(): void
}

/**
 * `size` workers from the lab's worker module, built at the start of a series
 * or a batch and terminated at its end so their memory goes back. The owner
 * decides what each worker is sent (`useSeries`, `useFill`); the flag carries
 * the first press of the two-stage Stop (see `useGenerator`).
 */
export function openPool(size: number, handlers: PoolHandlers): Pool {
  const flag = crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null
  const workers: Worker[] = []
  let alive = true
  for (let i = 0; i < size; i++) {
    const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
    // The same stale-message race as `useGenerator`'s terminated worker.
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      if (alive) handlers.message(worker, event.data)
    }
    // Not `event.message`: a browser can raise this with no reliable message, and
    // an owner ending on `undefined` would read it as a clean finish.
    worker.onerror = () => {
      if (alive) handlers.failed('')
    }
    workers.push(worker)
  }
  return {
    workers,
    flag,
    stopRequested: () => flag !== null && Atomics.load(flag, 0) === 1,
    kill() {
      alive = false
      for (const worker of workers) worker.terminate()
    },
  }
}
