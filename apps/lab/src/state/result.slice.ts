import type { BoardData, BoardFile, BoardMeta, Params, View } from '@arrowz/engine'
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

/**
 * A board read out of the store: what it is, the file it came as, and the meta
 * the store holds beside it. Deliberately not a `ShownResult`: a stored board
 * has no `stats: CarverStats` and none of the run's counters, so a
 * `ReportInput` could only be invented for it (spec §5.3).
 */
export interface StoredBoard {
  readonly board: BoardData
  readonly file: unknown
  readonly meta: BoardMeta
}

export interface ResultState {
  shown: ShownResult | null
  baseline: Baseline | null
  /** The store's answer for `shown.file`, and for no other file. */
  saved: SaveOutcome | null
  /** Why the last SVG export of `shown.file` failed, and of no other file. */
  exportError: string | null
  /** The board the library shows, beside the run's own and never instead of it. */
  preview: StoredBoard | null
  /**
   * `showResult` as a single-slice action, kept for PR 5's load into lab. In
   * PR 4b nothing calls it: the only writer of `shown` is `completeRun`, which
   * applies `showResult` itself.
   */
  show(next: ShownResult): void
  stored(file: BoardFile, outcome: SaveOutcome): void
  /** An SVG export of `file` failed with `error`, or is starting again and clears it with null. */
  exported(file: BoardFile, error: string | null): void
  /** The library draws a stored board. The run's result is untouched. */
  showPreview(next: StoredBoard): void
  /** Leaving the library, or a board that could not be read. */
  clearPreview(): void
  /**
   * A new view for the stored board on screen. The board and its file are
   * untouched: nothing is regenerated, and the same file goes back to the
   * store with the new view in its meta (Ruling 4). A no-op with no preview,
   * as `stored` and `exported` are for a file no longer shown.
   */
  previewView(view: View): void
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
 * same `set` as the run's. The baseline moves only past a result with metrics;
 * rendering never moves it.
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
    exportError: null,
  }
}

type SetStore = (fn: (state: { result: ResultState }) => { result: ResultState }) => void

export function createResultSlice(set: SetStore): ResultState {
  return {
    shown: null,
    baseline: null,
    saved: null,
    exportError: null,
    preview: null,
    show: (next) => set((state) => ({ result: showResult(state.result, next) })),
    // Returning the state unchanged is zustand's no-op: `setState` skips an
    // update whose result is the state object itself.
    stored: (file, saved) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, saved } } : state)),
    exported: (file, exportError) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, exportError } } : state)),
    showPreview: (preview) => set((state) => ({ result: { ...state.result, preview } })),
    clearPreview: () =>
      set((state) => (state.result.preview === null ? state : { result: { ...state.result, preview: null } })),
    previewView: (view) =>
      set((state) =>
        state.result.preview === null
          ? state
          : {
              result: {
                ...state.result,
                preview: { ...state.result.preview, meta: { ...state.result.preview.meta, view } },
              },
            },
      ),
    reset: () =>
      set((state) => ({
        result: { ...state.result, shown: null, preview: null, baseline: null, saved: null, exportError: null },
      })),
  }
}
