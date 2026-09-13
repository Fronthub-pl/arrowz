import { type ParamGroup, PARAM_SPEC } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { panelId, tabId } from './GroupRail'
import { Knob } from './Knob'
import { StartKnob } from './StartKnob'

/** A group's knobs, in table order. */
function specsOf(group: ParamGroup) {
  return PARAM_SPEC.filter((spec) => spec.group === group)
}

/**
 * One group of knobs. The two knobs behind `--start` share one control, built
 * where the first of them would have stood and skipped for the second — the
 * rule is per knob, so a group with a surface flag in the middle still lays
 * out in table order.
 */
export function KnobPanel({ group }: { group: ParamGroup }) {
  const dict = useDictionary()
  // Five of the six groups have help; `board` has none, and the section is
  // typed by its own keys rather than by ParamGroup.
  const help = (dict.d.groupHelp as Partial<Record<ParamGroup, string>>)[group]
  const specs = specsOf(group)
  // Computed before the JSX, not tracked with a `let` the map mutates:
  // `react-hooks/immutability` rejects reassigning a variable during render,
  // and it is right to — the map is not guaranteed to run once per render.
  const firstStart = specs.findIndex((spec) => spec.surface === 'start')
  // No `tabIndex={0}` on the panel: APG gives a tabpanel a tab stop only when
  // it has no focusable content, and this one is nothing but focusable content.
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId(group)} aria-labelledby={tabId(group)}>
      <div className="fw-khd">
        <b>{dict.d.groups[group]}</b>
        {help === undefined ? null : <span>{help}</span>}
      </div>
      <div className="fw-grid">
        {specs.map((spec, at) => {
          if (spec.surface !== 'start') return <Knob key={spec.key} spec={spec} />
          // The control stands where the first of the pair would have; the
          // second spec draws nothing.
          return at === firstStart ? <StartKnob key="start" /> : null
        })}
      </div>
    </div>
  )
}
