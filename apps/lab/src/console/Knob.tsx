import type { ParamSpec } from '@arrowz/engine'
import { ChoiceKnob } from './ChoiceKnob'
import { ValueKnob } from './ValueKnob'

/**
 * A knob, drawn as `PARAM_SPEC` says. There is no boolean knob in the table —
 * the mock's switches are element attributes, not generator parameters — so
 * there are exactly two shapes here, and the composite start control is the
 * panel's business, not this dispatcher's.
 */
export function Knob({ spec }: { spec: ParamSpec }) {
  if (spec.control?.kind === 'choice') return <ChoiceKnob spec={spec} choices={spec.control.choices} />
  return <ValueKnob spec={spec} />
}
