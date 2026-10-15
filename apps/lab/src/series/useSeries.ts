import type { Params, WorkerIn } from '@fronthub/arrowz-engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import { openPool, type Pool } from './pool'
import { poolSize, seriesSeeds } from './seeds'

export interface SeriesHandle {
  start(params: Params): void
  abort(): void
}

const series = () => useStore.getState().series

/**
 * One series on a pool of workers (`openPool`). Seeds go out from a queue, one
 * at a time, to whichever worker answers: a slow seed does not hold the others
 * up. See `useGenerator` for the two-stage Stop.
 */
export function useSeries(): SeriesHandle {
  const pool = useRef<Pool | null>(null)

  const kill = useCallback(() => {
    pool.current?.kill()
    pool.current = null
  }, [])

  useEffect(() => kill, [kill])

  return useMemo<SeriesHandle>(
    () => ({
      start(params) {
        kill()
        const queue = seriesSeeds(params.seed, series().count)
        series().started(params, queue.length)
        let busy = 0
        const end = (error?: string) => {
          if (pool.current !== made) return
          kill()
          series().finished(error)
        }
        const next = (worker: Worker) => {
          const seed = made.stopRequested() ? undefined : queue.shift()
          if (seed === undefined) {
            if (busy === 0) end()
            return
          }
          busy++
          const message: WorkerIn =
            made.flag === null
              ? { type: 'seed', params: { ...params, seed } }
              : { type: 'seed', params: { ...params, seed }, stop: made.flag }
          worker.postMessage(message)
        }
        const made = openPool(poolSize(queue.length, navigator.hardwareConcurrency || 2), {
          message(worker, message) {
            if (message.type === 'seedDone') {
              busy--
              series().answered(message.run)
              next(worker)
            } else if (message.type === 'error') end(message.message)
          },
          failed: end,
        })
        pool.current = made
        for (const worker of made.workers) next(worker)
      },
      abort() {
        if (series().phase !== 'running') return
        const flag = pool.current?.flag ?? null
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
