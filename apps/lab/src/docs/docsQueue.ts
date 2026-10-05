/**
 * The Docs tab's boards, generated one at a time on a worker of their own and
 * kept for the session. Apart from the lab's run (`useGenerator`): nothing
 * here touches the store, so a board made on a page neither stops nor
 * replaces the lab's.
 *
 * Requests are served in the order they come, which is the order frames come
 * near the view. One withdrawn before its turn leaves the queue, so a reader
 * who scrolls past a board does not wait behind it; one withdrawn while it
 * runs still finishes into the cache. Two boards with one key share one run.
 *
 * `generate()` is synchronous inside the worker, so a second message would
 * only queue behind the first: the queue posts the next job when the last
 * one answers. `dispose` terminates the worker and forgets every job, and the
 * next request starts a new worker, as StrictMode's remount needs.
 */
import { type BoardData, decodeBoard, type Params, type WorkerIn, type WorkerOut } from '@arrowz/engine'
import type { ReportInput } from '@arrowz/engine/report'

export interface DocsRun {
  readonly board: BoardData
  readonly report: ReportInput
  readonly params: Params
}

export type DocsJob =
  | { readonly state: 'waiting' }
  | { readonly state: 'running' }
  | { readonly state: 'done'; readonly run: DocsRun }
  | { readonly state: 'failed'; readonly message: string }

/** What the queue needs of a `Worker`; the tests hand it a fake. */
export interface WorkerLike {
  postMessage(message: WorkerIn): void
  terminate(): void
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export interface DocsQueue {
  /** The run this session made for `key`, if it has. */
  cached(key: string): DocsRun | undefined
  /** Asks for a board; the listener hears each state. Returns the withdrawal. */
  request(key: string, params: Params, listener: (job: DocsJob) => void): () => void
  dispose(): void
}

/** The session's finished boards, by `DocsBoardSpec.key`: coming back to a page draws them at once. */
const SESSION = new Map<string, DocsRun>()

interface Job {
  readonly key: string
  readonly params: Params
  readonly listeners: Set<(job: DocsJob) => void>
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function reportOf(message: Extract<WorkerOut, { type: 'done' }>): ReportInput {
  const { ok, metrics, stats, pieces, backtracks, restartsUsed, genMs, metricsMs, totalMs, stuck, deadlock, aborted } =
    message
  return { ok, metrics, stats, pieces, backtracks, restartsUsed, genMs, metricsMs, totalMs, stuck, deadlock, aborted }
}

export function createDocsQueue(makeWorker: () => WorkerLike, cache: Map<string, DocsRun> = SESSION): DocsQueue {
  const waiting: Job[] = []
  let running: Job | null = null
  let worker: WorkerLike | null = null

  const tell = (job: Job, state: DocsJob) => {
    for (const listener of [...job.listeners]) listener(state)
  }

  const kill = () => {
    worker?.terminate()
    worker = null
  }

  const finish = (outcome: DocsJob) => {
    const job = running
    running = null
    if (job !== null) {
      if (outcome.state === 'done') cache.set(job.key, outcome.run)
      tell(job, outcome)
    }
    next()
  }

  const ensure = (): WorkerLike => {
    if (worker !== null) return worker
    const made = makeWorker()
    made.onmessage = (event) => {
      // A terminated worker's message can still be queued; it belongs to no job now.
      if (worker !== made || running === null) return
      const message = event.data
      if (message.type === 'error') finish({ state: 'failed', message: message.message })
      if (message.type !== 'done') return
      let board: BoardData
      try {
        board = decodeBoard(message.board)
      } catch (err) {
        finish({ state: 'failed', message: messageOf(err) })
        return
      }
      finish({ state: 'done', run: { board, report: reportOf(message), params: running.params } })
    }
    made.onerror = (event) => {
      if (worker !== made) return
      // Dropped, not kept: a worker that failed to load would take the next job and never answer.
      kill()
      finish({ state: 'failed', message: event.message })
    }
    worker = made
    return made
  }

  const next = () => {
    if (running !== null) return
    const job = waiting.shift()
    if (job === undefined) return
    running = job
    tell(job, { state: 'running' })
    ensure().postMessage({ type: 'generate', params: job.params })
  }

  return {
    cached: (key) => cache.get(key),
    request(key, params, listener) {
      const hit = cache.get(key)
      if (hit !== undefined) {
        listener({ state: 'done', run: hit })
        return () => {}
      }
      const shared = running !== null && running.key === key ? running : waiting.find((job) => job.key === key)
      const job = shared ?? { key, params, listeners: new Set() }
      if (shared === undefined) waiting.push(job)
      job.listeners.add(listener)
      if (job === running) listener({ state: 'running' })
      else {
        next()
        // A job `next` has just started heard `running` from it; one still in line waits.
        if (job !== running) listener({ state: 'waiting' })
      }
      return () => {
        job.listeners.delete(listener)
        if (job.listeners.size > 0 || job === running) return
        const at = waiting.indexOf(job)
        if (at >= 0) waiting.splice(at, 1)
      }
    },
    dispose() {
      kill()
      running = null
      waiting.length = 0
    },
  }
}
