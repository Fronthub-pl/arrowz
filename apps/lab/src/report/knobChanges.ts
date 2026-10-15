import { type InactiveKey, PARAM_SPEC, type ParamGroup, type Params } from '@fronthub/arrowz-engine'
import { startChoiceOf } from '@fronthub/arrowz-engine/command'
import type { Dict } from '@fronthub/arrowz-engine/i18n'
import { knobValueText } from '../console/knobValue'
import { specOf } from '../state/params.slice'

/** One knob that differs between two parameter sets, worded as its row shows it. */
export interface KnobChange {
  /** The control a jump focuses: `knob-<key>`, or `knob-start` for the pair behind `--start`. */
  readonly id: string
  readonly group: ParamGroup
  readonly label: string
  readonly before: string
  readonly after: string
  /** Why the knob has no effect on the board made with the `after` parameters, or null. */
  readonly inactive: InactiveKey | null
}

const MIX = specOf('mix')

/** `--start` as `StartKnob` shows it: the choice, and the share's own row beside `mixing`. */
function startText(dict: Dict, params: Params): string {
  const choice = startChoiceOf(params)
  const word = dict.d.start.options[choice]
  return choice === 'mixing' ? `${word} ${knobValueText(dict, MIX, params.mix)}` : word
}

/**
 * The knobs that differ between `before` and `after`, in `PARAM_SPEC` order.
 * The pair behind `--start` is one change, listed where its first knob stands,
 * as `KnobPanel` draws it as one control; it is compared by its text, which a
 * valid pair (the `startPair` rule) spells one way.
 */
export function knobChanges(dict: Dict, before: Params, after: Params): KnobChange[] {
  const out: KnobChange[] = []
  let startDone = false
  for (const spec of PARAM_SPEC) {
    if (spec.surface === 'start') {
      if (startDone) continue
      startDone = true
      const was = startText(dict, before)
      const now = startText(dict, after)
      if (was !== now)
        out.push({
          id: 'knob-start',
          group: spec.group,
          label: dict.d.short.headBias,
          before: was,
          after: now,
          inactive: null,
        })
      continue
    }
    if (before[spec.key] === after[spec.key]) continue
    out.push({
      id: `knob-${spec.key}`,
      group: spec.group,
      label: dict.d.short[spec.key],
      before: knobValueText(dict, spec, before[spec.key]),
      after: knobValueText(dict, spec, after[spec.key]),
      inactive: spec.inactive?.(after) ?? null,
    })
  }
  return out
}
