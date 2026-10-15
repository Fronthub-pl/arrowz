import { SEED_CEILING, SERIES_MAX } from './seeds'

export const FILL_MIN = 1
export const FILL_MAX = SERIES_MAX
export const FILL_DEFAULT = 10
/** The seed limit's cap: the default limit (twice the boards) of the most boards. */
export const FILL_SEEDS_MAX = 2 * FILL_MAX

/** How many seeds a batch from `seed` may try: `maxSeeds`, cut at the seed knob's ceiling. */
export function fillLimit(seed: number, maxSeeds: number): number {
  return Math.max(0, Math.min(maxSeeds, SEED_CEILING - seed + 1))
}

/**
 * Whether one more seed may go out: within the limit, and only while more
 * boards are wanted than are written or in flight, since each seed in flight
 * may be the last one needed. A batch so never writes more than it was asked
 * for, and tries the seeds `carve --count` tries, for a batch `carve --count` accepts.
 */
export function mayHandOut(p: {
  wanted: number
  limit: number
  written: number
  inFlight: number
  handedOut: number
}): boolean {
  return p.handedOut < p.limit && p.written + p.inFlight < p.wanted
}
