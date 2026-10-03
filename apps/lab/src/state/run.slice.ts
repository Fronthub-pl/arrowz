import type { Params, TraceInfo, WorkerOut } from '@arrowz/engine'
import { patcher, type SliceSet } from './slice'

/** The worker's `done` message, which is also what the report reads. */
export type DoneReport = Extract<WorkerOut, { type: 'done' }>

export type RunPhase = 'idle' | 'running' | 'done' | 'error'

/** What a run is started to do beyond carving, decided at its start (`useRun.start`). */
export interface RunIntent {
  /** Save the board it makes. */
  readonly save: boolean
  /** The stored layout it re-carves (Load into lab), which a dry run is compared with. */
  readonly storedId: string | null
}

/**
 * The process, not the product: the board a run makes lives in the result
 * slice, so a run in flight leaves the last one on screen.
 */
export interface RunState {
  phase: RunPhase
  /** The parameters this run was started with — not the knobs on screen. */
  params: Params | null
  /** Whether the board this run makes is to be saved, decided when it started (`useRun.start`). */
  save: boolean
  /** The stored layout this run re-carves, or null (`RunIntent`). */
  storedId: string | null
  progress: TraceInfo | null
  message: string | null
  /**
   * Why the slice is idle. An abort and a fresh page are both `idle`, and the
   * status line tells them apart (`dict.t('aborted')`); without this it
   * forgets the abort happened and prints `pressGenerate`.
   */
  wasAborted: boolean
  /** Stop was pressed and the worker has not answered yet; a second Stop discards. */
  stopping: boolean
  started(params: Params, intent?: Partial<RunIntent>): void
  progressed(info: TraceInfo): void
  failed(message: string): void
  aborted(): void
  stopRequested(): void
  reset(): void
}

const EMPTY = {
  phase: 'idle',
  params: null,
  save: false,
  storedId: null,
  progress: null,
  message: null,
  wasAborted: false,
  stopping: false,
} as const

/** The done transition as a pure function, applied by `completeRun` beside the result's. */
export function runDone(state: RunState): RunState {
  return { ...state, phase: 'done', progress: null, message: null, stopping: false }
}

export function createRunSlice(set: SliceSet<'run', RunState>): RunState {
  const patch = patcher(set, 'run')
  return {
    ...EMPTY,
    started: (params, intent) =>
      patch({ ...EMPTY, phase: 'running', params, save: intent?.save ?? false, storedId: intent?.storedId ?? null }),
    progressed: (progress) => patch({ progress }),
    failed: (message) => patch({ phase: 'error', progress: null, message, stopping: false }),
    // The only transition that leaves a mark on an otherwise empty slice: the
    // spread clears everything, then the flag goes back on.
    aborted: () => patch({ ...EMPTY, wasAborted: true }),
    stopRequested: () => patch({ stopping: true }),
    reset: () => patch({ ...EMPTY }),
  }
}
