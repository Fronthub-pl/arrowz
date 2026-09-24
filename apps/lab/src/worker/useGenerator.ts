import { decodeBoard } from '@arrowz/engine'
import type { BoardData, Params, WorkerIn, WorkerOut } from '@arrowz/engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'

/** Not `Generator`, which would shadow the standard library's `Generator<T>`. */
export interface GeneratorHandle {
  start(params: Params): void
  abort(): void
}

// Module scope, so the callbacks below have no changing dependency. Read, not
// subscribed: a subscription would re-render the whole shell on every progress
// message.
const actions = () => useStore.getState().run

/**
 * One worker for the whole session, reused while idle and terminated to
 * abort. `generate()` is synchronous, so the worker's event loop is blocked
 * for a whole run and a second message would queue behind the first;
 * replacing a run means terminating the worker and building a new one.
 *
 * Mounted once, in App: a route change must neither kill a run in flight nor
 * unmount <arrowz-board>, whose disposal releases the GL context.
 */
export function useGenerator(): GeneratorHandle {
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)

  const kill = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
    busy.current = false
  }, [])

  const ensure = useCallback((): Worker => {
    const existing = worker.current
    if (existing) return existing
    const made = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
    made.onmessage = (event: MessageEvent<WorkerOut>) => {
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
      busy.current = false
      actions().failed(event.message)
    }
    worker.current = made
    return made
  }, [])

  // The worker outlives every route, and dies with the application.
  useEffect(() => kill, [kill])

  return useMemo<GeneratorHandle>(
    () => ({
      start(params) {
        if (busy.current) kill()
        actions().started(params)
        busy.current = true
        ensure().postMessage({ type: 'generate', params } satisfies WorkerIn)
      },
      abort() {
        if (!busy.current) return
        kill()
        actions().aborted()
      },
    }),
    [ensure, kill],
  )
}
