import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { DraftNumber } from './DraftNumber'
import { descId } from './FieldHelp'
import { boundOn, KnobSlider } from './KnobSlider'

/**
 * One knob: a label, the value with the word the CLI spells it with, a
 * slider, and one paragraph for the state alone — what is wrong with it right
 * now, if anything (spec R7; the description itself is drawn once, under the
 * panel heading, by `FieldHelp`).
 *
 * Four subscriptions, all by this knob's key. Dragging another knob changes
 * none of them, so this component does not render: that is what the sparse
 * indexes in `params.slice` are for.
 *
 * The inline entry is `DraftNumber` (spec §5.5); the knob only knows its bounds.
 */
export function ValueKnob({ spec, bounds = spec }: { spec: ParamSpec; bounds?: { min: number; max: number } }) {
  const dict = useDictionary()
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const floor = useStore((state) => state.params.floor[spec.key])
  const set = useStore((state) => state.params.set)

  const { label } = dict.paramText(spec)
  const word = wordFor(spec.key, value)
  // The same answer the marker draws, from the same predicate: a bound stated
  // only as a mark is a bound only a mouse can read.
  const bound = boundOn(floor, bounds)
  const state = broken
    ? broken.map((v) => dict.violation(v)).join('; ')
    : inactive
      ? `${dict.t('inactivePrefix')}${dict.reason(inactive)}`
      : bound === undefined
        ? null
        : dict.t('ruleBound', bound)
  // The description lives in the panel heading now (`FieldHelp`, spec R7),
  // one list for the whole group rather than one paragraph per card. This
  // paragraph holds only the state — what is wrong with the knob right now —
  // which the help switch never hides: turning descriptions off must not
  // turn a refusal off with them.
  const whyId = `knob-${spec.key}-why`

  return (
    <div className={`fw-k${broken ? ' bad' : ''}${inactive ? ' off' : ''}`}>
      <div className="top">
        <label className="lab" htmlFor={`knob-${spec.key}`}>
          {label}
        </label>
        <DraftNumber
          label={label}
          value={value}
          word={word}
          // The same paragraph the slider points at, plus the panel's own
          // description of this knob: a knob's reason or its description
          // reaching only one of them is a reason a keyboard user meets half
          // the time.
          describedBy={`${whyId} ${descId(spec.key)}`}
          // Held inside the *passed* bounds first: the mix row's own range is
          // narrower than the knob's, and only it knows that.
          onCommit={(typed) => set(spec.key, Math.min(bounds.max, Math.max(bounds.min, typed)))}
        />
      </div>
      <KnobSlider
        spec={spec}
        id={`knob-${spec.key}`}
        value={value}
        bounds={bounds}
        floor={floor}
        label={label}
        describedBy={`${whyId} ${descId(spec.key)}`}
        onCommit={(next) => set(spec.key, next)}
      />
      <p className="why" id={whyId} data-testid={whyId}>
        {state === null ? null : <span className="state">{state}</span>}
      </p>
    </div>
  )
}
