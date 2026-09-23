import { defaultParams, encodeBoard, generate, type Params } from '@arrowz/engine'
import { type FinishedRun, useStore } from './store'

/** A finished run as `completeRun` takes it, with the parameters it was started from. */
export interface FinishedFixture extends FinishedRun {
  params: Params
}

/**
 * A real carve, not a hand-built report: the report drawer reads every field.
 * 8×8 by default — seed 1 closes with 8 pieces and a longest of 18, seed 2 with
 * 13 and 17 (measured 2026-09-15), which the report cases rely on.
 */
export function finishedRun(seed: number, W = 8, H = 8): FinishedFixture {
  const params = { ...defaultParams(), W, H, seed }
  const result = generate(params)
  const file = encodeBoard(result.board)
  return {
    params,
    board: result.board,
    file,
    report: {
      type: 'done',
      ok: result.ok,
      metrics: result.metrics,
      backtracks: result.backtracks,
      restartsUsed: result.restartsUsed,
      genMs: result.genMs,
      metricsMs: result.metricsMs,
      totalMs: result.genMs + result.metricsMs,
      stuck: result.stuck,
      deadlock: result.deadlock,
      pieces: result.board.pieces.length,
      stats: result.board.stats,
      board: file,
    },
  }
}

/** Starts the run and finishes it, as `useGenerator` does for a real worker. */
export function finish(run: FinishedFixture): void {
  const state = useStore.getState()
  state.run.started(run.params)
  state.completeRun(run)
}
