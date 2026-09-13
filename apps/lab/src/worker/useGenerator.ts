import { decodeBoard } from '@arrowz/engine'
import type { Params, WorkerIn, WorkerOut } from '@arrowz/engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'

export interface Generator {
  start(params: Params): void
  abort(): void
}

// Module scope, so the callbacks below have no changing dependency to declare.
// The slice is read rather than subscribed to: this hook publishes state and
// never renders from it, and a subscription would re-render App — the whole
// shell — on every progress message.
const actions = () => useStore.getState().run

/**
 * One worker for the whole session, reused while idle and terminated to
 * abort. `generate()` is synchronous, so the worker's event loop is blocked
 * for a whole run and a second message would queue behind the first;
 * replacing a run means terminating the worker and building a new one, as the
 * Deno lab does (lab-page.ts:856, :879).
 *
 * Mounted once, in App: a route change must neither kill a run in flight nor
 * unmount <arrowz-board>, whose disposal releases the GL context.
 */
export function useGenerator(): Generator {
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
        actions().finished({ board: decodeBoard(message.board), file: message.board, report: message })
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

  return useMemo<Generator>(
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
