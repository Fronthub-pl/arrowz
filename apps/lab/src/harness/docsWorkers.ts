/**
 * Workers for the Docs boards' tests: one that a test answers by hand, one
 * that answers every request with a real board, and a queue that never
 * answers. A real board, from the engine's `generate`, so what the element
 * draws and what the stats read is what the worker would have posted.
 */
import { encodeBoard, generate, type Params, type WorkerIn, type WorkerOut } from '@arrowz/engine'
import { createDocsQueue, type DocsQueue, type WorkerLike } from '../docs/docsQueue'

export function doneMessage(params: Params, ok = true): WorkerOut {
  const result = generate(params)
  return {
    type: 'done',
    ok: ok && result.ok,
    metrics: result.metrics,
    backtracks: result.backtracks,
    restartsUsed: result.restartsUsed,
    genMs: result.genMs,
    metricsMs: result.metricsMs,
    totalMs: result.genMs + result.metricsMs,
    stuck: result.stuck,
    deadlock: result.deadlock,
    aborted: result.aborted,
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  }
}

export class FakeWorker implements WorkerLike {
  posted: WorkerIn[] = []
  terminated = false
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: WorkerIn): void {
    this.posted.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  answer(out: WorkerOut): void {
    this.onmessage?.(new MessageEvent('message', { data: out }))
  }
  fail(message: string): void {
    // Node has no ErrorEvent, and the queue reads only `message` off it.
    this.onerror?.({ message } as ErrorEvent)
  }
}

export function fakeWorkers(): { make: () => FakeWorker; made: FakeWorker[] } {
  const made: FakeWorker[] = []
  return {
    made,
    make: () => {
      const worker = new FakeWorker()
      made.push(worker)
      return worker
    },
  }
}

export function answeringWorkers(): { make: () => WorkerLike; posted: Params[] } {
  const posted: Params[] = []
  return {
    posted,
    make: () => {
      const worker = new FakeWorker()
      worker.postMessage = (message) => {
        if (message.type !== 'generate') return
        posted.push(message.params)
        // On the next task, as a real worker's answer arrives: never inside `request`.
        setTimeout(() => worker.answer(doneMessage(message.params)), 0)
      }
      return worker
    },
  }
}

export function silentQueue(): DocsQueue {
  return createDocsQueue(() => new FakeWorker(), new Map())
}
