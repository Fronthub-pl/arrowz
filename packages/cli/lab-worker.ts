/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
// Laboratory worker: all generation happens here so that the interface stays
// responsive. A 1000×1000 board takes tens of seconds to compute — on the main
// thread it would freeze the tab.
//
// The finished board goes back as its board file: one string crosses the
// worker boundary instead of ~90 000 piece objects, and it is the very file
// the page sends to the store. Drawing, the SVG export and the table of the
// longest pieces happen on the page, from the decoded board.
import { encodeBoard, generate } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'

const post = (m: WorkerOut) => self.postMessage(m)

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const msg = event.data
  const started = performance.now()
  let result
  try {
    result = generate({
      ...msg.params,
      // Progress is sent as it happens: on large boards the user has to
      // see that something is going on, and be able to abort.
      trace: (info) => post({ type: 'progress', info }),
    })
  } catch (err) {
    // Includes the InvalidParamsError generate() throws for parameters outside
    // the safe envelope: its message lists the violations and the page shows it.
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
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  })
}
