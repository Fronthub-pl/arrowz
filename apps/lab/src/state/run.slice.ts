import type { BoardData, BoardFile, Params, TraceInfo, WorkerOut } from '@arrowz/engine'
import type { SaveOutcome } from '../api/boards'

/** The worker's `done` message, which is also what the report reads. */
export type DoneReport = Extract<WorkerOut, { type: 'done' }>

export type RunPhase = 'idle' | 'running' | 'done' | 'error'

export interface RunState {
  phase: RunPhase
  /** The parameters this run was started with — not the knobs on screen. */
  params: Params | null
  progress: TraceInfo | null
  board: BoardData | null
  file: BoardFile | null
  report: DoneReport | null
  message: string | null
  /** The store's answer, kept apart so it cannot overwrite the run's outcome. */
  saved: SaveOutcome | null
  /**
   * Why the slice is idle. An abort and a fresh page are both `idle` with no
   * report, and the old lab tells them apart (`dict.t('aborted')`,
   * lab-page.ts:863-868); without this the status line forgets the abort
   * happened and prints `pressGenerate`.
   */
  wasAborted: boolean
  started(params: Params): void
  progressed(info: TraceInfo): void
  finished(result: { board: BoardData; file: BoardFile; report: DoneReport }): void
  failed(message: string): void
  stored(outcome: SaveOutcome): void
  aborted(): void
  reset(): void
}

const EMPTY = {
  phase: 'idle',
  params: null,
  progress: null,
  board: null,
  file: null,
  report: null,
  message: null,
  saved: null,
  wasAborted: false,
} as const

type SetStore = (fn: (state: { run: RunState }) => { run: RunState }) => void

export function createRunSlice(set: SetStore): RunState {
  const patch = (next: Partial<RunState>) => set((state) => ({ run: { ...state.run, ...next } }))
  return {
    ...EMPTY,
    started: (params) => patch({ ...EMPTY, phase: 'running', params }),
    progressed: (progress) => patch({ progress }),
    finished: ({ board, file, report }) => patch({ phase: 'done', progress: null, board, file, report, message: null }),
    failed: (message) => patch({ phase: 'error', progress: null, board: null, file: null, message }),
    stored: (saved) => patch({ saved }),
    // The only transition that leaves a mark on an otherwise empty slice: the
    // spread clears everything, then the flag goes back on.
    aborted: () => patch({ ...EMPTY, wasAborted: true }),
    reset: () => patch({ ...EMPTY }),
  }
}
