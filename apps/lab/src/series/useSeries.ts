import type { Params, WorkerIn, WorkerOut } from '@arrowz/engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import { poolSize, seriesSeeds } from './seeds'

export interface SeriesHandle {
  start(params: Params): void
  abort(): void
}

const series = () => useStore.getState().series

/**
 * A pool of workers for one series, built at its start and terminated at its
 * end so their memory goes back. Seeds go out from a queue, one at a time, to
 * whichever worker answers: a slow seed does not hold the others up. One stop
 * flag is shared by every worker; see `useGenerator` for the two-stage Stop.
 */
export function useSeries(): SeriesHandle {
  const pool = useRef<Worker[]>([])
  const stop = useRef<Int32Array | null>(null)

  const kill = useCallback(() => {
    for (const worker of pool.current) worker.terminate()
    pool.current = []
    stop.current = null
  }, [])

  useEffect(() => kill, [kill])

  return useMemo<SeriesHandle>(
    () => ({
      start(params) {
        kill()
        const queue = seriesSeeds(params.seed, series().count)
        const flag = crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null
        stop.current = flag
        series().started(params, queue.length)
        const made: Worker[] = []
        let busy = 0
        const end = (error?: string) => {
          if (pool.current !== made) return
          kill()
          series().finished(error)
        }
        const next = (worker: Worker) => {
          const seed = flag !== null && Atomics.load(flag, 0) === 1 ? undefined : queue.shift()
          if (seed === undefined) {
            if (busy === 0) end()
            return
          }
          busy++
          const message: WorkerIn =
            flag === null
              ? { type: 'seed', params: { ...params, seed } }
              : { type: 'seed', params: { ...params, seed }, stop: flag }
          worker.postMessage(message)
        }
        const size = poolSize(queue.length, navigator.hardwareConcurrency || 2)
        for (let i = 0; i < size; i++) {
          const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
          worker.onmessage = (event: MessageEvent<WorkerOut>) => {
            // A terminated pool's message can still be queued; it belongs to no series now.
            if (pool.current !== made) return
            const message = event.data
            if (message.type === 'seedDone') {
              busy--
              series().answered(message.run)
              next(worker)
            } else if (message.type === 'error') end(message.message)
          }
          // Not `event.message`: a browser can raise this with no reliable message, and
          // `end(undefined)` there would read as the same call a clean finish makes.
          worker.onerror = () => end('')
          made.push(worker)
        }
        pool.current = made
        for (const worker of made) next(worker)
      },
      abort() {
        if (series().phase !== 'running') return
        const flag = stop.current
        if (flag !== null && !series().stopping) {
          Atomics.store(flag, 0, 1)
          series().stopRequested()
          return
        }
        kill()
        series().finished()
      },
    }),
    [kill],
  )
}
