import type { InactiveKey, ParamSpec } from '@fronthub/arrowz-engine'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { rowState, rowTitle } from './KnobRow'
import { RowShell, rowIds } from './rows/RowShell'

/**
 * A knob whose values are a fixed list: the words its flag takes, in the
 * row's control track, as long as a slider's track.
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
  const id = `knob-${spec.key}`
  const ids = rowIds(id)
  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="for"
      title={rowTitle(dict, label)}
      choice
      bad={broken !== undefined}
      off={off}
      control={
        <select
          id={id}
          value={value}
          aria-describedby={`${ids.why} ${ids.help}`}
          onChange={(event) => set(spec.key, Number(event.currentTarget.value))}
        >
          {choices.map((choice) => (
            <option key={choice.word} value={choice.value}>
              {dict.choiceText(spec.key, choice.word)}
            </option>
          ))}
        </select>
      }
      after={
        <p className="kv-why" id={ids.why} data-testid={ids.why}>
          {text}
        </p>
      }
    />
  )
}
