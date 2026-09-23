import type { InactiveKey, ParamSpec } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { descId } from './FieldHelp'
import { KnobLine, rowState, rowTitle, useKnobHelp } from './KnobRow'

/**
 * A knob whose values are a fixed list: the words its flag takes, in the
 * control's track of the row (handoff 2, PR 2), as long as a slider's track.
 * Two knobs are like this — `trapBias` and `giantSpacing` — and the words come
 * from `PARAM_SPEC`, so the console and the CLI cannot drift apart.
 */
export function ChoiceKnob({
  spec,
  choices,
  blockReason,
}: {
  spec: ParamSpec
  choices: readonly { value: number; word: string }[]
  blockReason?: InactiveKey | undefined
}) {
  const dict = useDictionary()
  const value = useStore((state) => state.params.values[spec.key])
  const broken = useStore((state) => state.params.broken[spec.key])
  const inactive = useStore((state) => state.params.inactive[spec.key])
  const set = useStore((state) => state.params.set)
  const { label, help } = dict.paramText(spec)
  const name = dict.d.short[spec.key]
  const { text, off } = rowState(dict, { broken, inactive, blockReason })
  const whyId = `knob-${spec.key}-why`
  const { button, paragraph } = useKnobHelp(spec.key, name, help)
  return (
    <div className={`kv-row choice${broken ? ' bad' : ''}${off ? ' off' : ''}`} title={rowTitle(dict, label)}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={`knob-${spec.key}`}>
            {name}
          </label>
        }
        help={button}
        control={
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
        }
      />
      <p className="kv-why" id={whyId} data-testid={whyId}>
        {text}
      </p>
      {paragraph}
    </div>
  )
}
