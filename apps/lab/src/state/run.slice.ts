import type { Params, TraceInfo, WorkerOut } from '@arrowz/engine'

/** The worker's `done` message, which is also what the report reads. */
export type DoneReport = Extract<WorkerOut, { type: 'done' }>

export type RunPhase = 'idle' | 'running' | 'done' | 'error'

/**
 * The process, not the product: the board a run makes lives in the result
 * slice, so a run in flight leaves the last one on screen (spec §5.3, PR 4b).
 */
export interface RunState {
  phase: RunPhase
  /** The parameters this run was started with — not the knobs on screen. */
  params: Params | null
  progress: TraceInfo | null
  message: string | null
  /**
   * Why the slice is idle. An abort and a fresh page are both `idle`, and the
   * status line tells them apart (`dict.t('aborted')`); without this it
   * forgets the abort happened and prints `pressGenerate`.
   */
  wasAborted: boolean
  started(params: Params): void
  progressed(info: TraceInfo): void
  failed(message: string): void
  aborted(): void
  reset(): void
}

const EMPTY = {
  phase: 'idle',
  params: null,
  progress: null,
  message: null,
  wasAborted: false,
} as const

/** The done transition as a pure function, applied by `completeRun` beside the result's. */
export function runDone(state: RunState): RunState {
  return { ...state, phase: 'done', progress: null, message: null }
}

type SetStore = (fn: (state: { run: RunState }) => { run: RunState }) => void

export function createRunSlice(set: SetStore): RunState {
  const patch = (next: Partial<RunState>) => set((state) => ({ run: { ...state.run, ...next } }))
  return {
    ...EMPTY,
    started: (params) => patch({ ...EMPTY, phase: 'running', params }),
    progressed: (progress) => patch({ progress }),
    failed: (message) => patch({ phase: 'error', progress: null, message }),
    // The only transition that leaves a mark on an otherwise empty slice: the
    // spread clears everything, then the flag goes back on.
    aborted: () => patch({ ...EMPTY, wasAborted: true }),
    reset: () => patch({ ...EMPTY }),
  }
}
