import type { ParamSpec } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

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
  const showHelp = useStore((state) => state.ui.help)
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const set = useStore((state) => state.params.set)
  const { label, help: description } = dict.paramText(spec)
  const state = broken
    ? broken.map((v) => dict.violation(v)).join('; ')
    : inactive
      ? `${dict.t('inactivePrefix')}${dict.reason(inactive)}`
      : null
  // Same shape as ValueKnob: the description is always present, the state
  // goes in front of it when there is one, and the help switch hides only the
  // description from the eye (Ruling 9). A choice knob has no slider, so this
  // paragraph is the only place either of them can appear.
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
          aria-describedby={whyId}
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
