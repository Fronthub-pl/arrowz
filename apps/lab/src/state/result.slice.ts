import type { BoardData, BoardFile, Params } from '@arrowz/engine'
import type { ReportInput } from '@arrowz/engine/report'
import type { SaveOutcome } from '../api/boards'

/**
 * The board on screen and what is read off it: the report, both exports, the
 * annotation and the store save (spec §5.3). A run in flight does not touch
 * it; only a finished run replaces it.
 */
export interface ShownResult {
  readonly board: BoardData
  readonly file: BoardFile
  readonly report: ReportInput
  /** What this board was made from — not the knobs on screen, and not a run in flight. */
  readonly params: Params
}

/** What the delta column compares with: the last shown result that had metrics, without its board. */
export interface Baseline {
  readonly report: ReportInput
  readonly params: Params
}

export interface ResultState {
  shown: ShownResult | null
  baseline: Baseline | null
  /** The store's answer for `shown.file`, and for no other file. */
  saved: SaveOutcome | null
  /** The only writer of `shown` in the application; in PR 4b only `completeRun` reaches it. */
  show(next: ShownResult): void
  stored(file: BoardFile, outcome: SaveOutcome): void
  /** For the tests' resets, beside `run.reset()`. */
  reset(): void
}

/**
 * The report fields and nothing else. The worker's `done` message is a
 * `ReportInput` structurally and carries the board file too; keeping the
 * message would keep that string twice more, in the report and the baseline.
 */
export function reportInputOf(report: ReportInput): ReportInput {
  return {
    ok: report.ok,
    metrics: report.metrics,
    stats: report.stats,
    pieces: report.pieces,
    backtracks: report.backtracks,
    restartsUsed: report.restartsUsed,
    genMs: report.genMs,
    metricsMs: report.metricsMs,
    totalMs: report.totalMs,
    stuck: report.stuck,
    deadlock: report.deadlock,
  }
}

/**
 * The show transition as a pure function, so `completeRun` can apply it in the
 * same `set` as the run's. The baseline moves only past a result with metrics,
 * as the old lab's `prevStats` does (lab-page.ts:833, :1425-1429); rendering
 * never moves it, which is why `keepPrev` has no counterpart here.
 */
export function showResult(state: ResultState, next: ShownResult): ResultState {
  const before = state.shown
  return {
    ...state,
    shown: { board: next.board, file: next.file, report: reportInputOf(next.report), params: next.params },
    baseline:
      before !== null && before.report.metrics !== null
        ? { report: before.report, params: before.params }
        : state.baseline,
    saved: null,
  }
}

type SetStore = (fn: (state: { result: ResultState }) => { result: ResultState }) => void

export function createResultSlice(set: SetStore): ResultState {
  return {
    shown: null,
    baseline: null,
    saved: null,
    show: (next) => set((state) => ({ result: showResult(state.result, next) })),
    // Returning the state unchanged is zustand's no-op: `setState` skips an
    // update whose result is the state object itself.
    stored: (file, saved) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, saved } } : state)),
    reset: () => set((state) => ({ result: { ...state.result, shown: null, baseline: null, saved: null } })),
  }
}
