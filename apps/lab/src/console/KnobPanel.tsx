import { type ParamGroup, type ParamKey, PARAM_SPEC, type ParamSpec } from '@arrowz/engine'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { panelId, tabId } from './GroupRail'
import { Knob } from './Knob'
import { CollapsibleBlock } from './KnobRow'
import { BLOCKS, blockKeys, type KnobBlock } from './knobLayout'
import { StartKnob } from './StartKnob'

/** A group's knobs, in table order. */
function specsOf(group: ParamGroup) {
  return PARAM_SPEC.filter((spec) => spec.group === group)
}

function specOf(key: ParamKey): ParamSpec {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (spec === undefined) throw new Error(`PARAM_SPEC has no ${key}`)
  return spec
}

/**
 * The lengths group's mix (handoff 2, PR 2): short, medium and the long rest
 * as one bar, sized by their shares, with a legend in percent. The rule that
 * short and medium together stay at or under 0.9 is a `--warn` mark at 90%
 * of the bar, the rule floor's colour on a track; past it the long share
 * turns `--error`, as a refusal does. The bar repeats the rows under it, so
 * it is hidden from assistive technology; the legend is text.
 */
function LengthMix(): ReactElement {
  const dict = useDictionary()
  const short = useStore((state) => state.params.values.wShort)
  const medium = useStore((state) => state.params.values.wMid)
  const long = Math.max(0, 1 - short - medium)
  const over = short + medium > 0.9 + 1e-9
  const pct = (share: number) => `${Math.round(share * 100)}%`
  return (
    <div className="kv-mix">
      <div className="bar" aria-hidden="true">
        <span className="s" style={{ flex: short }} />
        <span className="m" style={{ flex: medium }} />
        <span className={over ? 'l bad' : 'l'} style={{ flex: long }} />
        <span className="cap" title={dict.t('mixCap')} />
      </div>
      <div className="leg">
        <span>
          {dict.t('mixShort')} <b>{pct(short)}</b>
        </span>
        <span>
          {dict.t('mixMedium')} <b>{pct(medium)}</b>
        </span>
        <span className={over ? 'bad' : undefined}>
          {dict.t('mixLong')} <b>{pct(long)}</b>
        </span>
      </div>
    </div>
  )
}

/**
 * A group's dependency block (`knobLayout.ts`): the knobs that do nothing
 * until a parent does, on while any parent is above 0, held open while one of
 * them is refused or asked for by the palette (`CollapsibleBlock`).
 */
function DependencyBlock({ block }: { block: KnobBlock }): ReactElement {
  const dict = useDictionary()
  const keys = blockKeys(block)
  const on = useStore((state) => block.parents.some((key) => state.params.values[key] > 0))
  const refused = useStore((state) => keys.some((key) => state.params.broken[key] !== undefined))
  const wanted = useStore((state) => {
    const target = state.ui.focusTarget
    return target !== null && keys.some((key) => target === `knob-${key}`)
  })
  return (
    <CollapsibleBlock
      id={`dep-${block.id}`}
      on={on}
      forced={refused || wanted}
      needs={dict.t(block.needs)}
      title={dict.t(block.title)}
      count={keys.length}
    >
      {block.subs.map((sub) => (
        <div key={sub.keys.join()} className="kv-subs">
          {sub.title === null ? null : <div className="kv-sub">{dict.t(sub.title)}</div>}
          {sub.keys.map((key) => (
            <Knob key={key} spec={specOf(key)} blockReason={block.reason} />
          ))}
        </div>
      ))}
    </CollapsibleBlock>
  )
}

/**
 * One group of knobs as rows on one five-track grid (handoff 2, PR 2). Table
 * order, with two exceptions: the two knobs behind `--start` share one row,
 * built where the first of them would have stood; and a dependency block's
 * knobs leave their places for the block, which stands right after its last
 * parent — so `later share`, the skeleton's second parent, moves up beside
 * `giants`.
 */
export function KnobPanel({ group }: { group: ParamGroup }) {
  const dict = useDictionary()
  // Five of the six groups have help; `board` has none, and the section is
  // typed by its own keys rather than by ParamGroup.
  const help = (dict.d.groupHelp as Partial<Record<ParamGroup, string>>)[group]
  const specs = specsOf(group)
  const block = BLOCKS[group]
  const inBlock = new Set<ParamKey>(block === undefined ? [] : blockKeys(block))
  const lastParent =
    block === undefined ? -1 : Math.max(...block.parents.map((key) => specs.findIndex((s) => s.key === key)))
  // Computed before the JSX, not tracked with a `let` the map mutates:
  // `react-hooks/immutability` rejects reassigning a variable during render.
  const firstStart = specs.findIndex((spec) => spec.surface === 'start')
  const rows = specs.flatMap((spec, at) => {
    const out: ReactElement[] = []
    if (spec.surface === 'start') {
      if (at === firstStart) out.push(<StartKnob key="start" />)
    } else if (!inBlock.has(spec.key)) {
      out.push(<Knob key={spec.key} spec={spec} />)
    }
    if (block !== undefined && at === lastParent) out.push(<DependencyBlock key={block.id} block={block} />)
    return out
  })
  // No `tabIndex={0}` on the panel: APG gives a tabpanel a tab stop only when
  // it has no focusable content, and this one is nothing but focusable content.
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId(group)} aria-labelledby={tabId(group)}>
      <div className="fw-khd">
        <b>{dict.d.groups[group]}</b>
        {help === undefined ? null : <span>{help}</span>}
      </div>
      <div className="kv kv-g">
        {group === 'lengths' ? <LengthMix /> : null}
        {rows}
      </div>
    </div>
  )
}
