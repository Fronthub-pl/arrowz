import { decodeBoard, encodeBoard, generate, toSvg } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'

// Two messages, against the same engine the CLI carves with: the protocol is
// the engine's own, so §6 leaves it untouched. The finished board crosses as
// its board
// file — one packed record instead of ~90 000 piece objects — and it is the
// very file that goes to the store.
const post = (message: WorkerOut) => self.postMessage(message)

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
  const started = performance.now()
  let result
  try {
    result = generate(message.params, { trace: (info) => post({ type: 'progress', info }) })
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
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  })
}
