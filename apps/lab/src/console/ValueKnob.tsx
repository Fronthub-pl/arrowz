import type { ParamSpec } from '@arrowz/engine'
import { wordFor } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { DraftNumber } from './DraftNumber'
import { boundOn, KnobSlider } from './KnobSlider'

/**
 * One knob: a label, the value with the word the CLI spells it with, a slider,
 * and one paragraph that always says something — the knob's own description,
 * prefixed by whatever is wrong with it right now.
 *
 * Four subscriptions, all by this knob's key. Dragging another knob changes
 * none of them, so this component does not render: that is what the sparse
 * indexes in `params.slice` are for.
 *
 * The inline entry is `DraftNumber` (spec §5.5); the knob only knows its bounds.
 */
export function ValueKnob({ spec, bounds = spec }: { spec: ParamSpec; bounds?: { min: number; max: number } }) {
  const dict = useDictionary()
  const showHelp = useStore((state) => state.ui.help)
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const floor = useStore((state) => state.params.floor[spec.key])
  const set = useStore((state) => state.params.set)

  const { label, help: description } = dict.paramText(spec)
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
  // The description is always present; the state, when there is one, goes in
  // front of it — the shape the old lab builds with `help.dataset.why`.
  //
  // Two spans, not one string. The state must survive the switch: it is the
  // reason the run is refused, and the switch is about descriptions (Ruling
  // 9). The description stays in the tree, visually hidden, so
  // `aria-describedby` never dangles and a link carrying `help:false` does
  // not strip the descriptions from someone else's screen reader.
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
          // The same paragraph the slider points at. Both surfaces of the
          // value carry it: a knob's reason reaching only one of them is a
          // reason a keyboard user meets half the time.
          describedBy={whyId}
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
        describedBy={whyId}
        onCommit={(next) => set(spec.key, next)}
      />
      <p className="why" id={whyId} data-testid={whyId}>
        {/* The separator lives outside `.state`: an exact-text lookup for the
            reason alone (rather than "reason. ") must still find it. */}
        {state === null ? null : (
          <>
            <span className="state">{state}</span>
            {'. '}
          </>
        )}
        <span className={showHelp ? 'desc' : 'desc fw-vh'}>{description}</span>
      </p>
    </div>
  )
}
