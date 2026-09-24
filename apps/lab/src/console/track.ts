/** Where a value sits on a track, as a percentage. */
export function percent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

/**
 * The floor a knob's track actually carries, if any. A floor at the knob's
 * minimum bounds nothing — the whole track is legal — so it is not a bound.
 * A floor at its maximum bounds everything but the last value, which is the
 * most a bound can say. Past the maximum is off the track.
 *
 * One predicate, two readers: the marker draws this number and the knob's
 * sentence states it, and the two must never disagree about whether there is
 * one at all.
 */
export function boundOn(floor: number | undefined, bounds: { min: number; max: number }): number | undefined {
  return floor !== undefined && floor > bounds.min && floor <= bounds.max ? floor : undefined
}
