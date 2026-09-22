import type { ParamSpec } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { descId } from './FieldHelp'

/**
 * A knob whose values are a fixed list: the words its flag takes, in the
 * field's place. Two knobs are like this — `trapBias` and `giantSpacing` —
 * and the words come from `PARAM_SPEC`, so the console and the CLI cannot
 * drift apart.
 */
export function ChoiceKnob({
  spec,
  choices,
}: {
  spec: ParamSpec
  choices: readonly { value: number; word: string }[]
}) {
  const dict = useDictionary()
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const set = useStore((state) => state.params.set)
  const { label } = dict.paramText(spec)
  const state = broken
    ? broken.map((v) => dict.violation(v)).join('; ')
    : inactive
      ? `${dict.t('inactivePrefix')}${dict.reason(inactive)}`
      : null
  // Same shape as ValueKnob: the description lives in the panel heading now
  // (`FieldHelp`, spec R7); this paragraph holds only the state, which the
  // help switch never hides (Ruling 9). A choice knob has no slider, so the
  // select is the only control this paragraph and the panel's description
  // both need to reach.
  const whyId = `knob-${spec.key}-why`
  return (
    <div className={`fw-k choice${broken ? ' bad' : ''}${inactive ? ' off' : ''}`}>
      <div className="top">
        <label className="lab" htmlFor={`knob-${spec.key}`}>
          {label}
        </label>
        <select
          id={`knob-${spec.key}`}
          value={value}
          aria-describedby={`${whyId} ${descId(spec.key)}`}
          onChange={(event) => set(spec.key, Number(event.currentTarget.value))}
        >
          {choices.map((choice) => (
            <option key={choice.word} value={choice.value}>
              {dict.choiceText(spec.key, choice.word)}
            </option>
          ))}
        </select>
      </div>
      <p className="why" id={whyId} data-testid={whyId}>
        {state === null ? null : <span className="state">{state}</span>}
      </p>
    </div>
  )
}
