import type { Params, SeedRun } from '@arrowz/engine'
import { SERIES_DEFAULT, SERIES_MAX, SERIES_MIN } from '../series/seeds'

export type SeriesPhase = 'idle' | 'running' | 'done'

/**
 * The knobs checked over many seeds: the process and its answers in one
 * slice, since a series shows no board. `params` are the knobs at the start,
 * not the ones on screen.
 */
export interface SeriesState {
  phase: SeriesPhase
  params: Params | null
  /** The field's value: how many seeds the next series checks. */
  count: number
  /** How many seeds this series set out to check (shorter near the seed ceiling). */
  planned: number
  /** In seed order. */
  runs: SeedRun[]
  stopping: boolean
  error: string | null
  setCount(count: number): void
  started(params: Params, planned: number): void
  answered(run: SeedRun): void
  stopRequested(): void
  finished(error?: string): void
  reset(): void
}

const EMPTY = { phase: 'idle', params: null, planned: 0, runs: [], stopping: false, error: null } as const

type SetStore = (fn: (state: { series: SeriesState }) => { series: SeriesState }) => void

export function createSeriesSlice(set: SetStore): SeriesState {
  const patch = (next: Partial<SeriesState>) => set((state) => ({ series: { ...state.series, ...next } }))
  return {
    ...EMPTY,
    runs: [],
    count: SERIES_DEFAULT,
    setCount: (count) => patch({ count: Math.min(SERIES_MAX, Math.max(SERIES_MIN, Math.round(count))) }),
    started: (params, planned) => patch({ ...EMPTY, runs: [], phase: 'running', params, planned }),
    answered: (run) =>
      set((state) => ({
        series: { ...state.series, runs: [...state.series.runs, run].sort((a, b) => a.seed - b.seed) },
      })),
    stopRequested: () => patch({ stopping: true }),
    finished: (error) => patch({ phase: 'done', stopping: false, error: error ?? null }),
    reset: () => patch({ ...EMPTY, runs: [], count: SERIES_DEFAULT }),
  }
}
