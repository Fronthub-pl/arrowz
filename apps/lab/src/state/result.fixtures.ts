import { defaultParams, encodeBoard, generate, type Params } from '@fronthub/arrowz-engine'
import { type FinishedRun, useStore } from './store'

/** A finished run as `completeRun` takes it, with the parameters it was started from. */
export interface FinishedFixture extends FinishedRun {
  params: Params
}

/**
 * A real carve, not a hand-built report: the report drawer reads every field.
 * 8×8 by default — seed 1 closes with 8 pieces and a longest of 18, seed 2 with
 * 13 and 17, which the report cases rely on.
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
      aborted: result.aborted,
      pieces: result.board.pieces.length,
      stats: result.board.stats,
      board: file,
    },
  }
}

/** Starts the run and finishes it, as `useGenerator` does for a real worker. */
export function finish(run: FinishedFixture, save = false): void {
  const state = useStore.getState()
  state.run.started(run.params, { save })
  state.completeRun(run)
}

/** A finished run as a Stop leaves it: not closed, aborted. The board is a real one; only the flags differ. */
export function stoppedRun(seed: number): FinishedFixture {
  const run = finishedRun(seed)
  return { ...run, report: { ...run.report, ok: false, aborted: true } }
}

/**
 * The board on screen finished again under changed knobs, through the same
 * `started` and `completeRun` a real run goes through: the board and its size
 * stay, and the result before it becomes the baseline when it had metrics.
 */
export function finishShownAgain(patch: Partial<Params>): void {
  const state = useStore.getState()
  const shown = state.result.shown
  if (shown === null) throw new Error('no result on screen to finish again')
  state.run.started({ ...shown.params, ...patch })
  state.completeRun({
    board: shown.board,
    file: shown.file,
    report: { ...shown.report, type: 'done', board: shown.file },
  })
}
