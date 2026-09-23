import type { InactiveKey, ParamSpec, Violation } from '@arrowz/engine'
import type { Dict } from '@arrowz/engine/i18n'
import { type ReactElement, type ReactNode, useState } from 'react'
import { useDictionary } from '../i18n'
import { descId } from './FieldHelp'
import { boundOn, percent } from './KnobSlider'

/**
 * A knob row's five tracks (handoff 2, PR 2): the label with its `?`, the
 * value, the minimum, the control and the maximum. Every row of every group
 * is this one grid (console.css, `.kv-g .ln`), so values, tracks and selects
 * sit on one x down the whole panel.
 */
export function KnobLine({
  label,
  help,
  value = null,
  min = null,
  control,
  max = null,
}: {
  label: ReactNode
  help: ReactNode
  value?: ReactNode
  min?: ReactNode
  control: ReactNode
  max?: ReactNode
}): ReactElement {
  return (
    <div className="ln">
      <span className="lc">
        {label}
        {help}
      </span>
      <span className="vc">{value}</span>
      <span className="mn">{min}</span>
      <span className="cc">{control}</span>
      <span className="mx">{max}</span>
    </div>
  )
}

/**
 * The description on demand: a `?` beside the label and the paragraph under
 * the row. The paragraph is always in the tree, out of sight while closed
 * (`.fw-vh`, never `display: none`), because every control of the row names it
 * in `aria-describedby` — a closed description must not dangle a reference
 * (Ruling 9 of 2026-09-13-lab-run-triggers).
 */
export function useKnobHelp(key: string, name: string, text: string) {
  const dict = useDictionary()
  const [open, setOpen] = useState(false)
  const id = descId(key)
  const button = (
    <button
      type="button"
      className="q"
      aria-expanded={open}
      aria-controls={id}
      aria-label={dict.t('aboutKnob', name)}
      onClick={() => setOpen((was) => !was)}
    >
      ?
    </button>
  )
  const paragraph = (
    <p className={open ? 'kv-help' : 'kv-help fw-vh'} id={id}>
      {text}
    </p>
  )
  return { button, paragraph }
}

/**
 * What a row says under itself, and whether it is dimmed. A refusal first, in
 * `--error`; then a reason for having no effect, unless it is the reason the
 * row's dependency block already states in its header (`blockReason`); then a
 * rule bound, in `--warn`. The line is never hidden by anything: turning a
 * description off must not turn a refusal off with it.
 */
export function rowState(
  dict: Dict,
  {
    broken,
    inactive,
    bound,
    blockReason,
  }: {
    broken: readonly Violation[] | undefined
    inactive: InactiveKey | undefined
    bound?: number | undefined
    blockReason?: InactiveKey | undefined
  },
): { text: string | null; off: boolean } {
  const off = inactive !== undefined
  if (broken) return { text: broken.map((v) => dict.violation(v)).join('; '), off }
  if (inactive !== undefined && inactive !== blockReason)
    return { text: `${dict.t('inactivePrefix')}${dict.reason(inactive)}`, off }
  if (bound !== undefined) return { text: dict.t('ruleBound', bound), off }
  return { text: null, off }
}

/**
 * A bound in the 36px track: large numbers shortened (`5k`, `4.3G`), the rest
 * as the language writes them. The exact range stays in the row's title.
 */
export function endText(dict: Dict, n: number): string {
  if (n >= 1e9) return `${dict.fmt(Number((n / 1e9).toFixed(1)))}G`
  if (n >= 1e4) return `${dict.fmt(Math.round(n / 1e3))}k`
  if (n >= 1000) return `${dict.fmt(Number((n / 1e3).toFixed(n % 1000 === 0 ? 0 : 1)))}k`
  return dict.fmt(n)
}

/** The row's tooltip: the engine's full sentence, and the range for a number. */
export function rowTitle(dict: Dict, label: string, range?: { min: number; max: number }): string {
  return range === undefined ? label : `${label} · ${dict.fmt(range.min)}–${dict.fmt(range.max)}`
}

/**
 * The drawn track (handoff 2, PR 2): a 2px rail, the fill, a 2×12 thumb and
 * the rule floor, with the native range input over them, transparent and
 * covering the whole box — so the keyboard, the touch and the value come from
 * the platform, and the look does not depend on the browser's slider parts.
 * The simple view keeps `KnobSlider`, which the handoff does not touch.
 */
export function KnobTrack({
  spec,
  id,
  value,
  bounds = spec,
  floor,
  word,
  describedBy,
  onCommit,
}: {
  spec: ParamSpec
  id: string
  value: number
  bounds?: { min: number; max: number }
  floor?: number | undefined
  word: string | null
  describedBy: string
  onCommit(value: number): void
}): ReactElement {
  const dict = useDictionary()
  const pct = percent(value, bounds.min, bounds.max)
  const mark = boundOn(floor, bounds)
  return (
    <div className="kv-track">
      <span className="rail" />
      <span className="fill" style={{ width: `${pct}%` }} />
      <span className="thumb" style={{ left: `${pct}%` }} />
      {mark === undefined ? null : (
        <span
          className="floor"
          title={dict.t('ruleBound', mark)}
          style={{ left: `${percent(mark, bounds.min, bounds.max)}%` }}
        />
      )}
      <input
        type="range"
        id={id}
        min={bounds.min}
        max={bounds.max}
        step={spec.step}
        value={value}
        // The CLI's word for the value, where it has one: a slider announcing
        // "0" for --lmax=auto announces a maximum length of nothing.
        aria-valuetext={word ?? undefined}
        aria-describedby={describedBy}
        onChange={(event) => onCommit(Number(event.currentTarget.value))}
      />
    </div>
  )
}
