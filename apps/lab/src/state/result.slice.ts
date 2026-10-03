import type { BoardData, BoardFile, BoardMeta, Params, View } from '@arrowz/engine'
import type { ReportInput } from '@arrowz/engine/report'
import type { SaveOutcome } from '../api/boards'
import type { SliceSet } from './slice'

/**
 * The board on screen and what is read off it: the report, both exports, the
 * annotation and the store save. A run in flight does not touch it; only a
 * finished run replaces it.
 */
export interface ShownResult {
  readonly board: BoardData
  readonly file: BoardFile
  readonly report: ReportInput
  /** What this board was made from — not the knobs on screen, and not a run in flight. */
  readonly params: Params
  /** Its run was asked to save it: the switch, ⌘G. Save board saves a board without it. */
  readonly save: boolean
}

/** What the delta column compares with: the last shown result that had metrics, without its board. */
export interface Baseline {
  readonly report: ReportInput
  readonly params: Params
}

/**
 * A board read out of the store: the board, the file it came as, and its meta.
 * Not a `ShownResult`: it has no `CarverStats` or run counters, so a
 * `ReportInput` could only be invented for it.
 */
export interface StoredBoard {
  readonly origin: 'store'
  readonly board: BoardData
  readonly file: BoardFile
  readonly meta: BoardMeta
}

/** A board opened from disk: the file itself, and its meta when it came along. Nothing of it is in the store. */
export interface OpenedFile {
  readonly origin: 'file'
  readonly board: BoardData
  readonly file: BoardFile
  readonly meta: BoardMeta | null
  readonly name: string
  /** The board's layout hash, computed on open. */
  readonly id: string
}

export type Preview = StoredBoard | OpenedFile

export interface ResultState {
  shown: ShownResult | null
  baseline: Baseline | null
  /** The store's answer for `shown.file`, or `'pending'` while one is awaited; for no other file. */
  saved: SaveOutcome | 'pending' | null
  /** Why the last SVG export of `shown.file` failed, and of no other file. */
  exportError: string | null
  /** The board the library shows, beside the run's own and never instead of it. */
  preview: Preview | null
  stored(file: BoardFile, outcome: SaveOutcome): void
  /** A save of `file` has gone out; a no-op for a file no longer shown, as `stored` is. */
  saving(file: BoardFile): void
  /** An SVG export of `file` failed with `error`, or is starting again and clears it with null. */
  exported(file: BoardFile, error: string | null): void
  /** The library draws a stored board or an opened file. The run's result is untouched. */
  showPreview(next: Preview): void
  /** Leaving the library, or a board that could not be read. */
  clearPreview(): void
  /**
   * A new view for the stored board on screen, or an opened file's own meta
   * when it has one. The board and its file are untouched: nothing is
   * regenerated, and the same file goes back to the store with the new view
   * in its meta. A no-op with no preview or a file with no meta, as `stored`
   * and `exported` are for a file no longer shown.
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
    aborted: report.aborted,
  }
}

/**
 * The show transition as a pure function, so `completeRun` can apply it in the
 * same `set` as the run's. The baseline moves only past a result with metrics,
 * nor past a stopped one, whose numbers describe a board cut short.
 */
export function showResult(state: ResultState, next: ShownResult): ResultState {
  const before = state.shown
  return {
    ...state,
    shown: {
      board: next.board,
      file: next.file,
      report: reportInputOf(next.report),
      params: next.params,
      save: next.save,
    },
    baseline:
      before !== null && before.report.metrics !== null && !before.report.aborted
        ? { report: before.report, params: before.params }
        : state.baseline,
    saved: null,
    exportError: null,
  }
}

export function createResultSlice(set: SliceSet<'result', ResultState>): ResultState {
  return {
    shown: null,
    baseline: null,
    saved: null,
    exportError: null,
    preview: null,
    // Returning the state unchanged is zustand's no-op: `setState` skips an
    // update whose result is the state object itself.
    stored: (file, saved) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, saved } } : state)),
    saving: (file) =>
      set((state) =>
        state.result.shown?.file === file ? { result: { ...state.result, saved: 'pending' as const } } : state,
      ),
    exported: (file, exportError) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, exportError } } : state)),
    showPreview: (preview) => set((state) => ({ result: { ...state.result, preview } })),
    clearPreview: () =>
      set((state) => (state.result.preview === null ? state : { result: { ...state.result, preview: null } })),
    previewView: (view) =>
      set((state) => {
        const preview = state.result.preview
        if (preview === null || preview.meta === null) return state
        return { result: { ...state.result, preview: { ...preview, meta: { ...preview.meta, view } } } }
      }),
    reset: () =>
      set((state) => ({
        result: { ...state.result, shown: null, preview: null, baseline: null, saved: null, exportError: null },
      })),
  }
}
