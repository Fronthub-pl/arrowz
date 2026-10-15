import type { BoardFile, Params, SeedRun, WorkerIn } from '@fronthub/arrowz-engine'
import { storeRequest } from '@fronthub/arrowz-engine/command'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { saveBoard } from '../api/boards'
import { storedView } from '../library/saveShown'
import { refreshLibrary } from '../library/useLibraryList'
import type { FillError } from '../state/fill.slice'
import { useStore } from '../state/store'
import { fillLimit, mayHandOut } from './fill'
import { openPool, type Pool } from './pool'
import { poolSize } from './seeds'

export interface FillHandle {
  start(params: Params): void
  abort(): void
}

const fill = () => useStore.getState().fill

/** Ends the batch in the slice, and lists the store again, once, if the batch put anything there. */
function finish(error?: FillError): void {
  const { written, alreadyStored } = fill()
  fill().finished(error)
  // A stale answer is a board on disk too.
  if (written > 0 || alreadyStored.length > 0 || error?.kind === 'stale') refreshLibrary()
}

/**
 * Saves complete boards over the seeds from the knobs' seed up, as `carve
 * --count` does: a seed whose board is not complete is skipped, and so is a
 * layout the store already holds (its recipe is saved all the same), until
 * the boards asked for are written or the seed limit is reached. `mayHandOut`
 * keeps the batch from writing more than it was asked for. The worker encodes
 * each complete board once; the page posts that file as it is, one save at a
 * time, and keeps none. Stop works as in `useSeries`; a store that does not
 * take a board ends the batch.
 */
export function useFill(): FillHandle {
  const pool = useRef<Pool | null>(null)

  const kill = useCallback(() => {
    pool.current?.kill()
    pool.current = null
  }, [])

  useEffect(() => kill, [kill])

  return useMemo<FillHandle>(
    () => ({
      start(params) {
        kill()
        const { count, maxSeeds } = fill()
        const limit = fillLimit(params.seed, maxSeeds ?? 2 * count)
        // Read once, as the knobs are: an edit during the batch changes nothing in it.
        const view = storedView(params)
        fill().started(params, count, limit)
        const idle: Worker[] = []
        let handedOut = 0
        // Seeds in a worker, and complete boards on their way to the store.
        let inFlight = 0
        let saves = Promise.resolve()
        const end = (error?: FillError) => {
          if (pool.current !== made) return
          kill()
          finish(error)
        }
        const pump = () => {
          if (pool.current !== made) return
          while (
            !made.stopRequested() &&
            mayHandOut({ wanted: count, limit, written: fill().written, inFlight, handedOut })
          ) {
            const worker = idle.shift()
            if (worker === undefined) break
            const seeded = { ...params, seed: params.seed + handedOut }
            handedOut++
            inFlight++
            const message: WorkerIn =
              made.flag === null ? { type: 'fill', params: seeded } : { type: 'fill', params: seeded, stop: made.flag }
            worker.postMessage(message)
          }
          if (inFlight === 0) end()
        }
        const save = (run: SeedRun, board: BoardFile, restarts: number, backtracks: number) => {
          const request = storeRequest(board, { ...params, seed: run.seed }, view, 'lab', {
            ok: true,
            pieces: run.pieces,
            maxLen: run.maxLen,
            genMs: run.genMs,
            restarts,
            backtracks,
            stuck: null,
            aborted: false,
          })
          saves = saves.then(async () => {
            // A batch that ended (a failed save, a second Stop) posts nothing more.
            if (pool.current !== made) return
            const outcome = await saveBoard(request)
            if (pool.current !== made) {
              // The batch ended while this board was on its way; it is on disk all the same.
              if (outcome.ok || outcome.stale === true) refreshLibrary()
              return
            }
            inFlight--
            if (!outcome.ok) {
              end(outcome.stale === true ? { kind: 'stale' } : { kind: 'store', message: outcome.error })
              return
            }
            fill().saved(run.seed, outcome.layoutExisted)
            pump()
          })
        }
        const made = openPool(poolSize(Math.min(count, limit), navigator.hardwareConcurrency || 2), {
          message(worker, message) {
            if (message.type === 'error') {
              end({ kind: 'worker', message: message.message })
              return
            }
            if (message.type !== 'fillDone') return
            idle.push(worker)
            fill().answered(message.run)
            // The worker sends a board only for a complete seed; an answer that breaks that is not saved.
            if (message.run.outcome === 'complete' && message.board !== null)
              save(message.run, message.board, message.restarts, message.backtracks)
            else inFlight--
            pump()
          },
          failed: (error) => end({ kind: 'worker', message: error }),
        })
        pool.current = made
        for (const worker of made.workers) idle.push(worker)
        pump()
      },
      abort() {
        if (fill().phase !== 'running') return
        const flag = pool.current?.flag ?? null
        // First press: no more seeds; the running ones hand back what they have and saves on their way land.
        if (flag !== null && !fill().stopping) {
          Atomics.store(flag, 0, 1)
          fill().stopRequested()
          return
        }
        kill()
        finish()
      },
    }),
    [kill],
  )
}
