import { PARAM_SPEC, type ParamSpec } from '@arrowz/engine'
import { isStartChoice, START, START_CHOICES, startChoiceOf } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { ValueKnob } from './ValueKnob'

/**
 * Read once, at module load. A `const` narrowed by a module-level `if` does not
 * stay narrowed inside a function declaration, so the check and the binding are
 * one expression.
 */
const MIX_SPEC: ParamSpec = (() => {
  const spec = PARAM_SPEC.find((s) => s.key === 'mix')
  if (!spec) throw new Error('PARAM_SPEC has no mix')
  return spec
})()

/**
 * The composite `--start` control. One flag writes `headBias` and `mix`, so
 * the panel shows one control in their place: the three words the CLI takes,
 * plus `mixing`, which reveals the share as a knob of its own.
 *
 * The share row is bounded by `START.mix`, not by the knob's own range: the
 * knob runs from −1 (a word, not a share) while only 0.3..0.7 is spellable.
 */
export function StartKnob() {
  const dict = useDictionary()
  const showHelp = useStore((state) => state.ui.help)
  // The *word*, not the values object. `values` is rebuilt on every commit, so
  // subscribing to it would rerender this control — and the share row under it
  // — on every tick of every slider in the group, which is the one thing the
  // per-key indexes exist to prevent.
  const choice = useStore((state) => startChoiceOf(state.params.values))
  const setStart = useStore((state) => state.params.setStart)
  const start = dict.d.start
  return (
    <>
      <div className="fw-k choice">
        <div className="top">
          <label className="lab" htmlFor="knob-start">
            {start.label}
          </label>
          <select
            id="knob-start"
            value={choice}
            aria-describedby="knob-start-why"
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
        </div>
        <p className="why" id="knob-start-why" data-testid="knob-start-why">
          <span className={showHelp ? 'desc' : 'desc fw-vh'}>{start.help}</span>
        </p>
      </div>
      {choice === 'mixing' ? <ValueKnob spec={MIX_SPEC} bounds={START.mix} /> : null}
    </>
  )
}
