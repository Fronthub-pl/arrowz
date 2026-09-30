import { isStartChoice, START, START_CHOICES, startChoiceOf } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { specOf } from '../state/params.slice'
import { useStore } from '../state/store'
import { rowTitle } from './KnobRow'
import { RowShell, rowIds } from './rows/RowShell'
import { ValueKnob } from './ValueKnob'

const MIX_SPEC = specOf('mix')

/**
 * The composite `--start` control. One flag writes `headBias` and `mix`, so
 * the panel shows one control in their place: the three words the CLI takes,
 * plus `mixing`, which reveals the share as a knob of its own.
 *
 * The share row is bounded by `START.mix`, not by the knob's own range: the
 * knob runs from −1 (a word, not a share) while only 0.3..0.7 is spellable.
 * The select stands in the control's track, as a choice knob's does.
 */
export function StartKnob() {
  const dict = useDictionary()
  // The *word*, not the values object. `values` is rebuilt on every commit, so
  // subscribing to it would rerender this control — and the share row under it
  // — on every tick of every slider in the group, which is the one thing the
  // per-key indexes exist to prevent.
  const choice = useStore((state) => startChoiceOf(state.params.values))
  const setStart = useStore((state) => state.params.setStart)
  const start = dict.d.start
  const name = dict.d.short.headBias
  return (
    <>
      <RowShell
        id="knob-start"
        name={name}
        helpText={start.help}
        labelAs="for"
        title={rowTitle(dict, start.label)}
        choice
        control={
          <select
            id="knob-start"
            value={choice}
            aria-describedby={rowIds('knob-start').help}
            onChange={(event) => {
              const word = event.currentTarget.value
              // The options are built from the CLI's own vocabulary, so
              // anything else is a bug in this file.
              if (!isStartChoice(word)) throw new Error(`unknown start choice ${word}`)
              setStart(word)
            }}
          >
            {START_CHOICES.map((word) => (
              <option key={word} value={word}>
                {start.options[word]}
              </option>
            ))}
          </select>
        }
      />
      {choice === 'mixing' ? <ValueKnob spec={MIX_SPEC} bounds={START.mix} /> : null}
    </>
  )
}
