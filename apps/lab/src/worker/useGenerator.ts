import { decodeBoard } from '@fronthub/arrowz-engine'
import type { BoardData, Params, WorkerIn, WorkerOut } from '@fronthub/arrowz-engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { RunIntent } from '../state/run.slice'
import { useStore } from '../state/store'

/** Not `Generator`, which would shadow the standard library's `Generator<T>`. */
export interface GeneratorHandle {
  start(params: Params, intent: RunIntent): void
  abort(): void
}

// Module scope, so the callbacks below have no changing dependency. Read, not
// subscribed: a subscription would re-render the whole shell on every progress
// message.
const actions = () => useStore.getState().run

/**
 * One worker for the whole session, reused while idle and asked to stop
 * through shared memory, and terminated to discard. `generate()` is
 * synchronous, so the worker's event loop is blocked for a whole run and a
 * second message would queue behind the first; replacing a run means
 * terminating the worker and building a new one.
 *
 * Mounted once, in App: a route change must neither kill a run in flight nor
 * unmount <arrowz-board>, whose disposal releases the GL context.
 */
export function useGenerator(): GeneratorHandle {
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)
  const stop = useRef<Int32Array | null>(null)

  const kill = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
    busy.current = false
    stop.current = null
  }, [])

  const ensure = useCallback((): Worker => {
    const existing = worker.current
    if (existing) return existing
    const made = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
    made.onmessage = (event: MessageEvent<WorkerOut>) => {
      // A terminated worker's message can still be queued; it belongs to no run now.
      if (worker.current !== made) return
      const message = event.data
      if (message.type === 'progress') {
        actions().progressed(message.info)
        return
      }
      if (message.type === 'done') {
        busy.current = false
        let board: BoardData
        try {
          board = decodeBoard(message.board)
        } catch (err) {
          // A decode failure is a codec bug, shown. Unguarded, it would escape
          // with `busy` cleared and strand the slice in `running` with no way
          // out. `completeRun`'s throw (a run never started) stays outside on
          // purpose: it is a caller bug, not a run failure.
          actions().failed(err instanceof Error ? err.message : String(err))
          return
        }
        // Both slices in one update; until then the last result stays on screen.
        useStore.getState().completeRun({ board, file: message.board, report: message })
        return
      }
      if (message.type === 'error') {
        busy.current = false
        actions().failed(message.message)
      }
    }
    made.onerror = (event) => {
      if (worker.current !== made) return
      // Dropped, not kept: a worker that failed to load would take the next run and never answer.
      kill()
      actions().failed(event.message)
    }
    worker.current = made
    return made
  }, [kill])

  // The worker outlives every route, and dies with the application.
  useEffect(() => kill, [kill])

  return useMemo<GeneratorHandle>(
    () => ({
      start(params, intent) {
        if (busy.current) kill()
        actions().started(params, intent)
        busy.current = true
        // A fresh flag per run: a flag raised for the old run must not stop the new one.
        stop.current = crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null
        const message: WorkerIn =
          stop.current === null ? { type: 'generate', params } : { type: 'generate', params, stop: stop.current }
        ensure().postMessage(message)
      },
      abort() {
        if (!busy.current) return
        const flag = stop.current
        // First press: ask the worker to hand back what it has. Second press,
        // or no shared memory: drop the run, as a terminate always did.
        if (flag !== null && !useStore.getState().run.stopping) {
          Atomics.store(flag, 0, 1)
          actions().stopRequested()
          return
        }
        kill()
        actions().aborted()
      },
    }),
    [ensure, kill],
  )
}
