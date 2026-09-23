import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import type React from 'react'
import { useDictionary } from '../i18n'

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

/**
 * A knob's range as the mock's 2px bar, over a native range input (Ruling 3).
 * The fill and the thumb are the input's own pseudo-elements, driven by the
 * `--pct` custom property; the rule marker is a sibling, because it is not
 * part of the control's value.
 */
export function KnobSlider({
  spec,
  id,
  value,
  bounds = spec,
  floor,
  describedBy,
  label,
  onCommit,
}: {
  spec: ParamSpec
  id?: string | undefined
  value: number
  bounds?: { min: number; max: number }
  floor?: number | undefined
  describedBy?: string | undefined
  label: string
  onCommit: (value: number) => void
}) {
  const dict = useDictionary()
  const word = wordFor(spec.key, value)
  const pct = percent(value, bounds.min, bounds.max)
  // A mark at 0% would claim a bound where the whole track is already legal;
  // a mark at 100% says the last value is the only legal one. `boundOn` tells
  // the two apart, and the knob's sentence reads the same answer.
  const markFloor = boundOn(floor, bounds)
  return (
    <div className="bar">
      <input
        type="range"
        id={id}
        min={bounds.min}
        max={bounds.max}
        step={spec.step}
        value={value}
        aria-label={label}
        // The CLI's word for the value, where it has one: a slider announcing
        // "0" for --lmax=auto announces a maximum length of nothing.
        aria-valuetext={word ?? undefined}
        aria-describedby={describedBy}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(event) => onCommit(Number(event.currentTarget.value))}
      />
      {markFloor === undefined ? null : (
        <u title={dict.t('ruleBound', markFloor)} style={{ left: `${percent(markFloor, bounds.min, bounds.max)}%` }} />
      )}
    </div>
  )
}
