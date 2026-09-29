export const SERIES_MIN = 2
export const SERIES_MAX = 200
export const SERIES_DEFAULT = 20
/** The seed knob's `max` in `PARAM_SPEC`: `mulberry32` keeps 32 bits. */
export const SEED_CEILING = 2 ** 32 - 1

export function seriesSeeds(seed: number, count: number): number[] {
  const seeds: number[] = []
  for (let s = seed; s < seed + count && s <= SEED_CEILING; s++) seeds.push(s)
  return seeds
}

/** One core stays with the page; four is the cap, because a 1000×1000 seed holds ~390 MB (measured in Deno). */
export function poolSize(count: number, cores: number): number {
  return Math.max(1, Math.min(count, cores - 1, 4))
}
