import { decodeBoard, encodeBoard, GenerateAbort, generate, toSvg } from '@fronthub/arrowz-engine'
import type { WorkerIn, WorkerOut } from '@fronthub/arrowz-engine'
import { seedRunOf } from '@fronthub/arrowz-engine/report'

// The engine's own protocol, against the engine the CLI carves with. The
// finished board crosses as its board file (one packed record instead of
// ~90 000 piece objects), the very file that goes to the store.
const post = (message: WorkerOut) => self.postMessage(message)

/** The trace of a seed nobody watches cell by cell: it only reads the page's stop flag. */
const stopOnly = (stop: Int32Array | undefined) => () => {
  if (stop !== undefined && Atomics.load(stop, 0) === 1) throw new GenerateAbort('stopped from the page')
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const message = event.data
  if (message.type === 'svg') {
    try {
      post({ type: 'svg', svg: toSvg(decodeBoard(message.board), message.options) })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  if (message.type === 'seed') {
    try {
      const result = generate(message.params, { trace: stopOnly(message.stop) })
      post({ type: 'seedDone', run: seedRunOf(message.params.seed, result) })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  if (message.type === 'fill') {
    try {
      const result = generate(message.params, { trace: stopOnly(message.stop) })
      const run = seedRunOf(message.params.seed, result)
      post({
        type: 'fillDone',
        run,
        // Encoded once, here, and only for a board worth saving: the page posts this file as it is.
        board: run.outcome === 'complete' ? encodeBoard(result.board) : null,
        restarts: result.restartsUsed,
        backtracks: result.backtracks,
      })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  const started = performance.now()
  const { stop } = message
  let result
  try {
    result = generate(message.params, {
      trace: (info) => {
        post({ type: 'progress', info })
        if (stop !== undefined && Atomics.load(stop, 0) === 1) throw new GenerateAbort('stopped from the page')
      },
    })
  } catch (err) {
    // Includes InvalidParamsError, whose message lists the violations.
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  post({
    type: 'done',
    ok: result.ok,
    metrics: result.metrics,
    backtracks: result.backtracks,
    restartsUsed: result.restartsUsed,
    genMs: result.genMs,
    metricsMs: result.metricsMs,
    totalMs: performance.now() - started,
    stuck: result.stuck,
    deadlock: result.deadlock,
    aborted: result.aborted,
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  })
}
