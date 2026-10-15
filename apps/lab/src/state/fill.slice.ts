import type { Params, SeedRun } from '@fronthub/arrowz-engine'
import { FILL_DEFAULT, FILL_MAX, FILL_MIN, FILL_SEEDS_MAX } from '../series/fill'
import { patcher, type SliceSet } from './slice'

export type FillPhase = 'idle' | 'running' | 'done'

/** Why a batch ended early: a worker broke, the store did not take a board, or the store server is older than the lab. */
export type FillError = { kind: 'worker'; message: string } | { kind: 'store'; message: string } | { kind: 'stale' }

/**
 * Many boards saved over the seeds: the two fields, then one batch's targets
 * and tally. `params` are the knobs at the start. No board is kept here.
 */
export interface FillState {
  phase: FillPhase
  params: Params | null
  /** The field: how many boards the next batch saves. */
  count: number
  /** The field: how many seeds the next batch may try; null follows twice `count`, as `--max-seeds` does. */
  maxSeeds: number | null
  /** This batch's boards wanted, and its seed limit (shorter near the seed ceiling). */
  wanted: number
  limit: number
  written: number
  /** Seeds that answered; one cut short by Stop is not counted. */
  tried: number
  /** In seed order. */
  notComplete: number[]
  /** Complete seeds whose layout the store already held; their recipe was saved all the same. In seed order. */
  alreadyStored: number[]
  stopping: boolean
  error: FillError | null
  setCount(count: number): void
  setMaxSeeds(maxSeeds: number): void
  started(params: Params, wanted: number, limit: number): void
  answered(run: SeedRun): void
  saved(seed: number, layoutExisted: boolean): void
  stopRequested(): void
  finished(error?: FillError): void
  reset(): void
}

const EMPTY = {
  phase: 'idle',
  params: null,
  wanted: 0,
  limit: 0,
  written: 0,
  tried: 0,
  stopping: false,
  error: null,
} as const

const held = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))
const inSeedOrder = (seeds: readonly number[], seed: number) => [...seeds, seed].sort((a, b) => a - b)

export function createFillSlice(set: SliceSet<'fill', FillState>): FillState {
  const patch = patcher(set, 'fill')
  const update = (next: (fill: FillState) => Partial<FillState>) =>
    set((state) => ({ fill: { ...state.fill, ...next(state.fill) } }))
  return {
    ...EMPTY,
    notComplete: [],
    alreadyStored: [],
    count: FILL_DEFAULT,
    maxSeeds: null,
    setCount: (count) =>
      update((fill) => {
        const boards = held(count, FILL_MIN, FILL_MAX)
        return { count: boards, maxSeeds: fill.maxSeeds === 2 * boards ? null : fill.maxSeeds }
      }),
    setMaxSeeds: (maxSeeds) =>
      update((fill) => {
        const limit = held(maxSeeds, 1, FILL_SEEDS_MAX)
        return { maxSeeds: limit === 2 * fill.count ? null : limit }
      }),
    started: (params, wanted, limit) =>
      patch({ ...EMPTY, notComplete: [], alreadyStored: [], phase: 'running', params, wanted, limit }),
    answered: (run) =>
      update((fill) =>
        run.outcome === 'stopped'
          ? {}
          : run.outcome === 'complete'
            ? { tried: fill.tried + 1 }
            : { tried: fill.tried + 1, notComplete: inSeedOrder(fill.notComplete, run.seed) },
      ),
    saved: (seed, layoutExisted) =>
      update((fill) =>
        layoutExisted ? { alreadyStored: inSeedOrder(fill.alreadyStored, seed) } : { written: fill.written + 1 },
      ),
    stopRequested: () => patch({ stopping: true }),
    finished: (error) => patch({ phase: 'done', stopping: false, error: error ?? null }),
    reset: () => patch({ ...EMPTY, notComplete: [], alreadyStored: [], count: FILL_DEFAULT, maxSeeds: null }),
  }
}
