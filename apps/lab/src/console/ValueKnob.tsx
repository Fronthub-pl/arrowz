import type { InactiveKey, ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { useEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { DraftNumber } from './DraftNumber'
import { descId } from './FieldHelp'
import { endText, KnobLine, KnobTrack, rowState, rowTitle, useKnobHelp } from './KnobRow'
import { boundOn } from './KnobSlider'
import { RELEASE_TO, UNIT_OF } from './knobLayout'

/**
 * One number knob as a row (handoff 2, PR 2): the short label and its `?`,
 * the value with its unit, the minimum — or the special value's chip, which is
 * that minimum — the drawn track and the maximum; under it, the state line and
 * the description on demand.
 *
 * Four subscriptions, all by this knob's key. Dragging another knob changes
 * none of them, so this component does not render: that is what the sparse
 * indexes in `params.slice` are for.
 *
 * The inline entry is `DraftNumber` (spec §5.5); the knob only knows its bounds.
 */
export function ValueKnob({
  spec,
  bounds = spec,
  blockReason,
  value: shown,
  onSet,
}: {
  spec: ParamSpec
  bounds?: { min: number; max: number }
  blockReason?: InactiveKey | undefined
  /**
   * Another owner of the row (round 3, 3c): the simple view shows a size from
   * the recipe and writes it there, and writes the seed by the machine path.
   * Without them the row is the knob's, and a write is a knob edit.
   */
  value?: number | undefined
  onSet?: ((next: number) => void) | undefined
}) {
  const dict = useDictionary()
  const knob = useStore((state) => state.params.values[spec.key])
  const value = shown ?? knob
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const floor = useStore((state) => state.params.floor[spec.key])
  const setKnob = useStore((state) => state.params.set)
  const write = (next: number) => (onSet === undefined ? setKnob(spec.key, next) : onSet(next))

  const { label, help } = dict.paramText(spec)
  const name = dict.d.short[spec.key]
  const word = wordFor(spec.key, value)
  // A special value is the word the CLI spells the track's minimum with —
  // `--lmax=auto`, `--giantstep=random` — so it gets the minimum's track as a
  // chip. `maxBack`'s `auto` is 200, mid-track, and stays a number.
  const special = wordFor(spec.key, bounds.min)
  const isSpecial = special !== null && value === bounds.min
  // Where a released chip goes: the last value this row held, else the
  // default, else the smallest legal value (`knobLayout.ts`). Recorded after
  // the render, not during it.
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!isSpecial) last.current = value
  }, [value, isSpecial])
  const release = () => {
    const fallback = spec.def !== bounds.min ? spec.def : (RELEASE_TO[spec.key] ?? bounds.min + spec.step)
    write(last.current ?? fallback)
  }
  const bound = boundOn(floor, bounds)
  const { text, off } = rowState(dict, { broken, inactive, bound, blockReason })
  const whyId = `knob-${spec.key}-why`
  const describedBy = `${whyId} ${descId(spec.key)}`
  const unit = UNIT_OF[spec.key]
  const { button, paragraph } = useKnobHelp(descId(spec.key), name, help)

  return (
    <div className={`kv-row${broken ? ' bad' : ''}${off ? ' off' : ''}`} title={rowTitle(dict, label, bounds)}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={`knob-${spec.key}`}>
            {name}
          </label>
        }
        help={button}
        value={
          <span className="kv-val">
            <DraftNumber
              label={name}
              value={value}
              word={isSpecial ? special : null}
              wordOnly
              className="kv-num"
              describedBy={describedBy}
              // Held inside the *passed* bounds first: the mix row's own range
              // is narrower than the knob's, and only it knows that.
              onCommit={(typed) => write(Math.min(bounds.max, Math.max(bounds.min, typed)))}
            />
            <span className="kv-unit">{isSpecial || unit === undefined ? '' : dict.d.units[unit]}</span>
          </span>
        }
        min={
          special === null ? (
            <span className="kv-end">{endText(dict, bounds.min)}</span>
          ) : (
            <button
              type="button"
              className="kv-chip"
              aria-pressed={isSpecial}
              // Not `${name}: ${special}`: that is the value button's name
              // while the knob holds the special value, and two buttons of
              // one name are one button to a screen reader.
              aria-label={`${special} (${name})`}
              onClick={() => (isSpecial ? release() : write(bounds.min))}
            >
              {special}
            </button>
          )
        }
        control={
          <KnobTrack
            id={`knob-${spec.key}`}
            value={value}
            bounds={bounds}
            step={spec.step}
            floor={floor}
            word={word}
            describedBy={describedBy}
            onCommit={(next) => write(next)}
          />
        }
        max={<span className="kv-end">{endText(dict, bounds.max)}</span>}
      />
      <p className="kv-why" id={whyId} data-testid={whyId}>
        {text}
      </p>
      {paragraph}
    </div>
  )
}
