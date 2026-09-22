import { type ParamGroup, PARAM_SPEC } from '@arrowz/engine'
import { startChoiceOf } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { FieldHelp, type HelpEntry, descId } from './FieldHelp'
import { panelId, tabId } from './GroupRail'
import { Knob } from './Knob'
import { MIX_SPEC, StartKnob } from './StartKnob'

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
  const showHelp = useStore((state) => state.ui.help)
  // Five of the six groups have help; `board` has none, and the section is
  // typed by its own keys rather than by ParamGroup.
  const help = (dict.d.groupHelp as Partial<Record<ParamGroup, string>>)[group]
  const specs = specsOf(group)
  // Computed before the JSX, not tracked with a `let` the map mutates:
  // `react-hooks/immutability` rejects reassigning a variable during render,
  // and it is right to — the map is not guaranteed to run once per render.
  const firstStart = specs.findIndex((spec) => spec.surface === 'start')
  const mixing = useStore((state) => startChoiceOf(state.params.values) === 'mixing')
  // One entry per control drawn below, in the same order; the start pair is
  // one control, and the share joins it only while it is on screen.
  const entries: HelpEntry[] = specs.flatMap((spec, at) => {
    if (spec.surface !== 'start') {
      const text = dict.paramText(spec)
      return [{ id: descId(spec.key), label: text.label, text: text.help }]
    }
    if (at !== firstStart) return []
    const start = { id: descId('start'), label: dict.d.start.label, text: dict.d.start.help }
    if (!mixing) return [start]
    const mix = dict.paramText(MIX_SPEC)
    return [start, { id: descId('mix'), label: mix.label, text: mix.help }]
  })
  // No `tabIndex={0}` on the panel: APG gives a tabpanel a tab stop only when
  // it has no focusable content, and this one is nothing but focusable content.
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId(group)} aria-labelledby={tabId(group)}>
      <div className="fw-khd">
        <b>{dict.d.groups[group]}</b>
        {help === undefined || !showHelp ? null : <span>{help}</span>}
        <FieldHelp entries={entries} hidden={!showHelp} />
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
