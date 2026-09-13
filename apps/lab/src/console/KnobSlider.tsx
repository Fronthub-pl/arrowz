import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import type React from 'react'
import { useDictionary } from '../i18n'

/** Where a value sits on a track, as a percentage. */
function percent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
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
  // A floor outside the knob's own range marks nothing: the whole track is
  // already below it, and a marker at 0% or 100% would suggest otherwise.
  const markFloor = floor !== undefined && floor > bounds.min && floor < bounds.max ? floor : undefined
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
